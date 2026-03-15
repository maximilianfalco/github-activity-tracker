package github

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/maximilianfalco/github-activity-tracker/internal/data"
)

const apiBase = "https://api.github.com"

type Client struct {
	token string
	http  *http.Client
}

type Commit struct {
	SHA       string
	Message   string
	RepoName  string
	Branch    string
	URL       string
	CreatedAt time.Time
}

type PullRequest struct {
	Title     string
	RepoName  string
	URL       string
	State     string
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Review = PullRequest

type gitHubUser struct {
	Login  string `json:"login"`
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Email  string `json:"email"`
	Avatar string `json:"avatar_url"`
}

type gitHubEvent struct {
	Type      string `json:"type"`
	CreatedAt string `json:"created_at"`
	Repo      struct {
		Name string `json:"name"`
	} `json:"repo"`
	Payload struct {
		Ref string `json:"ref"`
	} `json:"payload"`
}

type repoCommit struct {
	SHA     string `json:"sha"`
	HTMLURL string `json:"html_url"`
	Commit  struct {
		Message string `json:"message"`
		Author  struct {
			Date string `json:"date"`
		} `json:"author"`
	} `json:"commit"`
}

type searchIssuesResponse struct {
	Items []struct {
		Title         string `json:"title"`
		HTMLURL       string `json:"html_url"`
		State         string `json:"state"`
		CreatedAt     string `json:"created_at"`
		UpdatedAt     string `json:"updated_at"`
		RepositoryURL string `json:"repository_url"`
		PullRequest   struct {
			MergedAt *string `json:"merged_at"`
		} `json:"pull_request"`
	} `json:"items"`
}

type searchCommitsResponse struct {
	Items []struct {
		SHA        string `json:"sha"`
		HTMLURL    string `json:"html_url"`
		Repository struct {
			FullName string `json:"full_name"`
		} `json:"repository"`
		Commit struct {
			Message string `json:"message"`
			Author  struct {
				Date string `json:"date"`
			} `json:"author"`
		} `json:"commit"`
	} `json:"items"`
}

func NewClient(token string) *Client {
	return &Client{
		token: strings.TrimSpace(token),
		http: &http.Client{
			Timeout: 20 * time.Second,
		},
	}
}

func (c *Client) FetchLogin(ctx context.Context) (string, error) {
	var user gitHubUser
	if err := c.getJSON(ctx, apiBase+"/user", "application/vnd.github.v3+json", &user); err != nil {
		return "", err
	}
	return user.Login, nil
}

func (c *Client) FetchProfile(ctx context.Context) (data.GitHubProfile, error) {
	var user gitHubUser
	if err := c.getJSON(ctx, apiBase+"/user", "application/vnd.github.v3+json", &user); err != nil {
		return data.GitHubProfile{}, err
	}
	return data.GitHubProfile{
		GitHubID: user.ID,
		Login:    user.Login,
		Name:     user.Name,
		Email:    user.Email,
		Image:    user.Avatar,
		Token:    c.token,
	}, nil
}

func (c *Client) FetchAll(ctx context.Context, login string) ([]Commit, []PullRequest, []Review, error) {
	commits, err := c.fetchCommits(ctx, login)
	if err != nil {
		return nil, nil, nil, err
	}
	prs, err := c.fetchPullRequests(ctx, login)
	if err != nil {
		return nil, nil, nil, err
	}
	reviews, err := c.fetchReviews(ctx, login)
	if err != nil {
		return nil, nil, nil, err
	}
	return commits, prs, reviews, nil
}

func (c *Client) fetchCommits(ctx context.Context, login string) ([]Commit, error) {
	eventCommits, err := c.fetchCommitsFromEvents(ctx, login)
	if err != nil {
		return nil, err
	}
	searchCommits, err := c.fetchCommitsFromSearch(ctx, login)
	if err != nil {
		return nil, err
	}

	seen := map[string]bool{}
	var merged []Commit
	for _, commit := range append(eventCommits, searchCommits...) {
		if seen[commit.SHA] {
			continue
		}
		seen[commit.SHA] = true
		merged = append(merged, commit)
	}

	sort.Slice(merged, func(i, j int) bool {
		return merged[i].CreatedAt.After(merged[j].CreatedAt)
	})
	return merged, nil
}

func (c *Client) fetchCommitsFromEvents(ctx context.Context, login string) ([]Commit, error) {
	var events []gitHubEvent
	if err := c.getJSON(ctx, fmt.Sprintf("%s/users/%s/events?per_page=100", apiBase, login), "application/vnd.github.v3+json", &events); err != nil {
		return nil, err
	}

	branches := map[string]bool{}
	for _, event := range events {
		if event.Type != "PushEvent" || event.Payload.Ref == "" {
			continue
		}
		branch := strings.TrimPrefix(event.Payload.Ref, "refs/heads/")
		branches[event.Repo.Name+":"+branch] = true
	}

	baseBranches := map[string]bool{"main": true, "master": true, "next": true, "develop": true, "dev": true}
	branchKeys := make([]string, 0, len(branches))
	for key := range branches {
		branchKeys = append(branchKeys, key)
	}
	sort.Slice(branchKeys, func(i, j int) bool {
		_, branchA := splitRepoBranch(branchKeys[i])
		_, branchB := splitRepoBranch(branchKeys[j])
		aBase := 1
		bBase := 1
		if baseBranches[branchA] {
			aBase = 0
		}
		if baseBranches[branchB] {
			bBase = 0
		}
		return aBase < bBase
	})

	since := time.Now().Add(-90 * 24 * time.Hour).UTC().Format(time.RFC3339)
	seen := map[string]bool{}
	var result []Commit
	for _, key := range branchKeys {
		repoName, branch := splitRepoBranch(key)
		endpoint := fmt.Sprintf("%s/repos/%s/commits?author=%s&sha=%s&per_page=100&since=%s", apiBase, repoName, url.QueryEscape(login), url.QueryEscape(branch), url.QueryEscape(since))
		var items []repoCommit
		if err := c.getJSON(ctx, endpoint, "application/vnd.github.v3+json", &items); err != nil {
			continue
		}
		for _, item := range items {
			if seen[item.SHA] {
				continue
			}
			seen[item.SHA] = true
			createdAt, _ := time.Parse(time.RFC3339, item.Commit.Author.Date)
			result = append(result, Commit{
				SHA:       item.SHA,
				Message:   firstLine(item.Commit.Message),
				RepoName:  repoName,
				Branch:    branch,
				URL:       item.HTMLURL,
				CreatedAt: createdAt,
			})
		}
	}

	return result, nil
}

func (c *Client) fetchCommitsFromSearch(ctx context.Context, login string) ([]Commit, error) {
	query := url.QueryEscape("author:" + login)
	endpoint := fmt.Sprintf("%s/search/commits?q=%s&sort=author-date&order=desc&per_page=100", apiBase, query)
	var response searchCommitsResponse
	if err := c.getJSON(ctx, endpoint, "application/vnd.github.cloak-preview+json", &response); err != nil {
		return nil, err
	}

	result := make([]Commit, 0, len(response.Items))
	for _, item := range response.Items {
		createdAt, _ := time.Parse(time.RFC3339, item.Commit.Author.Date)
		result = append(result, Commit{
			SHA:       item.SHA,
			Message:   firstLine(item.Commit.Message),
			RepoName:  item.Repository.FullName,
			URL:       item.HTMLURL,
			CreatedAt: createdAt,
		})
	}

	return result, nil
}

func (c *Client) fetchPullRequests(ctx context.Context, login string) ([]PullRequest, error) {
	items, err := c.fetchIssues(ctx, "is:pr author:"+login+" sort:updated")
	if err != nil {
		return nil, err
	}
	return items, nil
}

func (c *Client) fetchReviews(ctx context.Context, login string) ([]Review, error) {
	items, err := c.fetchIssues(ctx, "is:pr reviewed-by:"+login+" -author:"+login+" sort:updated")
	if err != nil {
		return nil, err
	}
	return items, nil
}

func (c *Client) fetchIssues(ctx context.Context, query string) ([]PullRequest, error) {
	endpoint := fmt.Sprintf("%s/search/issues?q=%s&per_page=100", apiBase, url.QueryEscape(query))
	var response searchIssuesResponse
	if err := c.getJSON(ctx, endpoint, "application/vnd.github.v3+json", &response); err != nil {
		return nil, err
	}

	result := make([]PullRequest, 0, len(response.Items))
	for _, item := range response.Items {
		createdAt, _ := time.Parse(time.RFC3339, item.CreatedAt)
		updatedAt, _ := time.Parse(time.RFC3339, item.UpdatedAt)
		state := "closed"
		if item.PullRequest.MergedAt != nil {
			state = "merged"
		} else if item.State == "open" {
			state = "open"
		}
		result = append(result, PullRequest{
			Title:     item.Title,
			RepoName:  extractRepoName(item.RepositoryURL),
			URL:       item.HTMLURL,
			State:     state,
			CreatedAt: createdAt,
			UpdatedAt: updatedAt,
		})
	}

	return result, nil
}

func (c *Client) getJSON(ctx context.Context, endpoint, accept string, target any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("build github request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", accept)

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("call github: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusForbidden && resp.Header.Get("X-RateLimit-Remaining") == "0" {
		return errors.New("GitHub rate limit exceeded")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("GitHub API error: %s", resp.Status)
	}
	return json.NewDecoder(resp.Body).Decode(target)
}

func splitRepoBranch(value string) (string, string) {
	parts := strings.SplitN(value, ":", 2)
	if len(parts) != 2 {
		return value, ""
	}
	return parts[0], parts[1]
}

func extractRepoName(repositoryURL string) string {
	parts := strings.Split(repositoryURL, "/repos/")
	if len(parts) == 2 {
		return parts[1]
	}
	return repositoryURL
}

func firstLine(message string) string {
	parts := strings.Split(message, "\n")
	return parts[0]
}

func BuildCacheEntries(userID string, commits []Commit, prs []PullRequest, reviews []Review) []data.Activity {
	fetchedAt := time.Now().UTC()
	seen := map[string]bool{}
	var result []data.Activity

	for _, commit := range commits {
		if seen[commit.SHA] {
			continue
		}
		seen[commit.SHA] = true
		result = append(result, data.Activity{
			ID:        "ghat_commit_" + commit.SHA,
			Type:      "commit",
			RepoName:  commit.RepoName,
			Title:     commit.Message,
			URL:       commit.URL,
			SHA:       validString(commit.SHA),
			Branch:    validString(commit.Branch),
			CreatedAt: commit.CreatedAt,
			FetchedAt: fetchedAt,
		})
	}
	for _, pr := range prs {
		result = append(result, data.Activity{
			ID:        activityID("pr", pr.URL),
			Type:      "pr",
			RepoName:  pr.RepoName,
			Title:     pr.Title,
			URL:       pr.URL,
			State:     validString(pr.State),
			CreatedAt: pr.CreatedAt,
			UpdatedAt: validTime(pr.UpdatedAt),
			FetchedAt: fetchedAt,
		})
	}
	for _, review := range reviews {
		result = append(result, data.Activity{
			ID:        activityID("review", review.URL),
			Type:      "review",
			RepoName:  review.RepoName,
			Title:     review.Title,
			URL:       review.URL,
			State:     validString(review.State),
			CreatedAt: review.CreatedAt,
			UpdatedAt: validTime(review.UpdatedAt),
			FetchedAt: fetchedAt,
		})
	}
	return result
}

func activityID(prefix, value string) string {
	replacer := strings.NewReplacer("https://", "", "http://", "", "/", "_", ":", "_", "?", "_", "&", "_", "=", "_", "-", "_")
	return "ghat_" + prefix + "_" + replacer.Replace(value)
}

func validString(value string) sql.NullString {
	return sql.NullString{String: value, Valid: value != ""}
}

func validTime(value time.Time) sql.NullTime {
	return sql.NullTime{Time: value, Valid: !value.IsZero()}
}
