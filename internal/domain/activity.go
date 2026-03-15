package domain

import (
	"database/sql"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/maximilianfalco/github-activity-tracker/internal/data"
)

type Overview struct {
	Commits30d     int
	OpenPRs        int
	MergedPRs      int
	ReviewsGiven   int
	RecentActivity []data.Activity
	IsStale        bool
}

type RepoBreakdown struct {
	RepoName       string
	Commits        int
	PRs            int
	Total          int
	LastActivityAt time.Time
}

func BuildOverview(items []data.Activity, stale bool) Overview {
	cutoff := daysAgo(30)
	recent := filterSince(items, cutoff, false)
	sorted := append([]data.Activity(nil), items...)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].CreatedAt.After(sorted[j].CreatedAt)
	})
	if len(sorted) > 15 {
		sorted = sorted[:15]
	}

	overview := Overview{
		IsStale:        stale,
		RecentActivity: sorted,
	}
	for _, item := range recent {
		switch item.Type {
		case "commit":
			overview.Commits30d++
		case "pr":
			if item.State.Valid && item.State.String == "merged" {
				overview.MergedPRs++
			}
		case "review":
			overview.ReviewsGiven++
		}
	}
	for _, item := range items {
		if item.Type == "pr" && item.State.Valid && item.State.String == "open" {
			overview.OpenPRs++
		}
	}
	return overview
}

func FilterByRange(items []data.Activity, rangeLabel string) []data.Activity {
	cutoff := rangeToCutoff(rangeLabel)
	return filterSince(items, cutoff, true)
}

func FilterPRState(items []data.Activity, state string) []data.Activity {
	if state == "" || state == "all" {
		return items
	}
	result := make([]data.Activity, 0, len(items))
	for _, item := range items {
		if item.Type == "pr" && item.State.Valid && item.State.String == state {
			result = append(result, item)
		}
	}
	return result
}

func SearchItems(items []data.Activity, query string) []data.Activity {
	query = strings.TrimSpace(strings.ToLower(query))
	if query == "" {
		return items
	}
	result := make([]data.Activity, 0, len(items))
	for _, item := range items {
		haystack := strings.ToLower(fmt.Sprintf("%s %s %s %s", item.RepoName, item.Title, item.URL, item.Branch.String))
		if strings.Contains(haystack, query) {
			result = append(result, item)
		}
	}
	return result
}

func BuildRepoBreakdown(items []data.Activity) []RepoBreakdown {
	repoMap := map[string]*RepoBreakdown{}
	for _, item := range items {
		entry := repoMap[item.RepoName]
		if entry == nil {
			entry = &RepoBreakdown{RepoName: item.RepoName}
			repoMap[item.RepoName] = entry
		}
		if item.Type == "commit" {
			entry.Commits++
		}
		if item.Type == "pr" {
			entry.PRs++
		}
		if item.CreatedAt.After(entry.LastActivityAt) {
			entry.LastActivityAt = item.CreatedAt
		}
		entry.Total = entry.Commits + entry.PRs
	}
	result := make([]RepoBreakdown, 0, len(repoMap))
	for _, item := range repoMap {
		result = append(result, *item)
	}
	sort.Slice(result, func(i, j int) bool {
		if result[i].Total == result[j].Total {
			return result[i].LastActivityAt.After(result[j].LastActivityAt)
		}
		return result[i].Total > result[j].Total
	})
	return result
}

func BuildRecap(items []data.Activity, hours int, includedTypes map[string]bool, includedRepos []string) ([]data.Activity, []string) {
	cutoff := time.Now().Add(-time.Duration(hours) * time.Hour)
	repoSet := map[string]bool{}
	for _, repo := range includedRepos {
		repoSet[repo] = true
	}

	var filtered []data.Activity
	allReposMap := map[string]bool{}
	for _, item := range items {
		allReposMap[item.RepoName] = true
		effective := item.CreatedAt
		if item.UpdatedAt.Valid && item.UpdatedAt.Time.After(effective) {
			effective = item.UpdatedAt.Time
		}
		if effective.Before(cutoff) {
			continue
		}
		if !includedTypes[item.Type] {
			continue
		}
		if len(repoSet) > 0 && !repoSet[item.RepoName] {
			continue
		}
		filtered = append(filtered, item)
	}
	allRepos := make([]string, 0, len(allReposMap))
	for repo := range allReposMap {
		allRepos = append(allRepos, repo)
	}
	sort.Strings(allRepos)
	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].CreatedAt.After(filtered[j].CreatedAt)
	})
	return filtered, allRepos
}

func FormatActivitiesForAI(items []data.Activity) string {
	repoMap := map[string][]data.Activity{}
	for _, item := range items {
		repoMap[item.RepoName] = append(repoMap[item.RepoName], item)
	}

	repos := make([]string, 0, len(repoMap))
	for repo := range repoMap {
		repos = append(repos, repo)
	}
	sort.Strings(repos)

	var lines []string
	for _, repo := range repos {
		lines = append(lines, "## "+repo)

		for _, item := range repoMap[repo] {
			switch item.Type {
			case "pr":
				state := "unknown"
				if item.State.Valid {
					state = item.State.String
				}
				lines = append(lines, fmt.Sprintf(`- PR: "%s" [%s] %s`, item.Title, state, item.URL))
			case "review":
				state := "unknown"
				if item.State.Valid {
					state = item.State.String
				}
				lines = append(lines, fmt.Sprintf(`- Review: "%s" [%s] %s`, item.Title, state, item.URL))
			case "commit":
				branch := "unknown"
				if item.Branch.Valid {
					branch = item.Branch.String
				}
				lines = append(lines, fmt.Sprintf(`- Commit (%s): "%s" %s`, branch, item.Title, item.URL))
			}
		}
		lines = append(lines, "")
	}
	return strings.Join(lines, "\n")
}

func daysAgo(days int) time.Time {
	return time.Now().Add(-time.Duration(days) * 24 * time.Hour)
}

func rangeToCutoff(rangeLabel string) time.Time {
	switch rangeLabel {
	case "1d":
		return daysAgo(2)
	case "7d":
		return daysAgo(7)
	case "90d":
		return daysAgo(90)
	default:
		return daysAgo(30)
	}
}

func filterSince(items []data.Activity, cutoff time.Time, commitsUseCreated bool) []data.Activity {
	result := make([]data.Activity, 0, len(items))
	for _, item := range items {
		effective := item.CreatedAt
		if !commitsUseCreated && item.UpdatedAt.Valid && item.UpdatedAt.Time.After(effective) {
			effective = item.UpdatedAt.Time
		}
		if effective.After(cutoff) || effective.Equal(cutoff) {
			result = append(result, item)
		}
	}
	return result
}

func StateString(item data.Activity) string {
	if item.State.Valid {
		return item.State.String
	}
	return ""
}

func BranchString(item data.Activity) string {
	if item.Branch.Valid {
		return item.Branch.String
	}
	return ""
}

func NewNullString(value string) sql.NullString {
	return sql.NullString{String: value, Valid: value != ""}
}
