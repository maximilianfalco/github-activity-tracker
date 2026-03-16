package app

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"slices"
	"strings"

	"github.com/maximilianfalco/github-activity-tracker/internal/ai"
	"github.com/maximilianfalco/github-activity-tracker/internal/data"
	"github.com/maximilianfalco/github-activity-tracker/internal/domain"
)

var validRecapTypes = map[string]bool{
	"commit": true,
	"pr":     true,
	"review": true,
}

type recapContext struct {
	BasePrompt          string             `json:"basePrompt"`
	CustomRule          string             `json:"customRule"`
	FormattedActivities string             `json:"formattedActivities"`
	Hours               int                `json:"hours"`
	IncludedRepos       []string           `json:"includedRepos"`
	IncludedTypes       []string           `json:"includedTypes"`
	AllRepos            []string           `json:"allRepos"`
	ItemCount           int                `json:"itemCount"`
	Items               []recapContextItem `json:"items"`
}

type recapContextItem struct {
	Type      string  `json:"type"`
	RepoName  string  `json:"repoName"`
	Title     string  `json:"title"`
	URL       string  `json:"url"`
	State     *string `json:"state"`
	SHA       *string `json:"sha"`
	Branch    *string `json:"branch"`
	CreatedAt string  `json:"createdAt"`
	UpdatedAt *string `json:"updatedAt"`
}

func parseRecapTypes(raw string) (map[string]bool, []string, error) {
	tokens := splitCSV(raw)
	if len(tokens) == 0 {
		tokens = []string{"commit", "pr", "review"}
	}

	seen := map[string]bool{}
	ordered := make([]string, 0, len(tokens))
	for _, token := range tokens {
		token = strings.ToLower(token)
		if token == "all" {
			return map[string]bool{"commit": true, "pr": true, "review": true}, []string{"commit", "pr", "review"}, nil
		}
		if !validRecapTypes[token] {
			return nil, nil, fmt.Errorf("invalid recap type %q (expected commit, pr, review, or all)", token)
		}
		if seen[token] {
			continue
		}
		seen[token] = true
		ordered = append(ordered, token)
	}

	included := make(map[string]bool, len(ordered))
	for _, token := range ordered {
		included[token] = true
	}
	return included, ordered, nil
}

func parseRecapRepos(raw []string) []string {
	seen := map[string]bool{}
	repos := make([]string, 0, len(raw))
	for _, value := range raw {
		for _, repo := range splitCSV(value) {
			if seen[repo] {
				continue
			}
			seen[repo] = true
			repos = append(repos, repo)
		}
	}
	return repos
}

func splitCSV(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		out = append(out, part)
	}
	return out
}

func buildRecapContext(items []data.Activity, hours int, includedTypes map[string]bool, includedTypeList []string, includedRepos []string, customRule string) recapContext {
	filtered, allRepos := domain.BuildRecap(items, hours, includedTypes, includedRepos)
	formatted := domain.FormatActivitiesForAI(filtered)
	serialized := make([]recapContextItem, 0, len(filtered))
	for _, item := range filtered {
		serialized = append(serialized, recapContextItem{
			Type:      item.Type,
			RepoName:  item.RepoName,
			Title:     item.Title,
			URL:       item.URL,
			State:     nullableString(item.State),
			SHA:       nullableString(item.SHA),
			Branch:    nullableString(item.Branch),
			CreatedAt: item.CreatedAt.UTC().Format(timeFormat),
			UpdatedAt: nullableTime(item.UpdatedAt),
		})
	}

	effectiveRepos := append([]string(nil), includedRepos...)
	if len(effectiveRepos) == 0 {
		repoSet := map[string]bool{}
		for _, item := range filtered {
			repoSet[item.RepoName] = true
		}
		for _, repo := range allRepos {
			if repoSet[repo] {
				effectiveRepos = append(effectiveRepos, repo)
			}
		}
	}

	return recapContext{
		BasePrompt:          ai.BasePrompt(),
		CustomRule:          customRule,
		FormattedActivities: formatted,
		Hours:               hours,
		IncludedRepos:       effectiveRepos,
		IncludedTypes:       append([]string(nil), includedTypeList...),
		AllRepos:            allRepos,
		ItemCount:           len(serialized),
		Items:               serialized,
	}
}

func (c *CLI) printRecapContext(hours int, includedTypes map[string]bool, includedTypeList []string, includedRepos []string, asJSON bool) error {
	context := buildRecapContext(c.activities, hours, includedTypes, includedTypeList, includedRepos, c.settings.RecapCustomRule)

	if asJSON {
		encoder := json.NewEncoder(stdoutWriter())
		encoder.SetIndent("", "  ")
		return encoder.Encode(context)
	}

	printSection("Recap Context")
	fmt.Println(itemStyle.Render(fmt.Sprintf("%s%d", labelStyle.Render("Hours: "), context.Hours)))
	fmt.Println(itemStyle.Render(fmt.Sprintf("%s%s", labelStyle.Render("Types: "), strings.Join(context.IncludedTypes, ", "))))
	fmt.Println(itemStyle.Render(fmt.Sprintf("%s%s", labelStyle.Render("Repos: "), repoSummary(context.IncludedRepos))))
	fmt.Println(itemStyle.Render(fmt.Sprintf("%s%d", labelStyle.Render("Items: "), context.ItemCount)))
	fmt.Println()
	fmt.Println(sectionStyle.Render("Custom Rule"))
	if strings.TrimSpace(context.CustomRule) == "" {
		fmt.Println(itemStyle.Render(mutedStyle.Render("(none)")))
	} else {
		fmt.Println(itemStyle.Render(context.CustomRule))
	}
	fmt.Println()
	fmt.Println(sectionStyle.Render("Formatted Activities"))
	if strings.TrimSpace(context.FormattedActivities) == "" {
		fmt.Println(itemStyle.Render(mutedStyle.Render("(no activity matched the filters)")))
	} else {
		fmt.Println(itemStyle.Render(context.FormattedActivities))
	}
	return nil
}

func repoSummary(repos []string) string {
	if len(repos) == 0 {
		return "(all active repos)"
	}
	copyRepos := append([]string(nil), repos...)
	slices.Sort(copyRepos)
	return strings.Join(copyRepos, ", ")
}

const timeFormat = "2006-01-02T15:04:05Z"

func nullableString(value sql.NullString) *string {
	if !value.Valid {
		return nil
	}
	out := value.String
	return &out
}

func nullableTime(value sql.NullTime) *string {
	if !value.Valid {
		return nil
	}
	out := value.Time.UTC().Format(timeFormat)
	return &out
}
