package app

import (
	"database/sql"
	"testing"
	"time"

	"github.com/maximilianfalco/github-activity-tracker/internal/data"
)

func TestParseRecapTypesDefaultsToAll(t *testing.T) {
	included, ordered, err := parseRecapTypes("")
	if err != nil {
		t.Fatalf("parseRecapTypes returned error: %v", err)
	}

	for _, kind := range []string{"commit", "pr", "review"} {
		if !included[kind] {
			t.Fatalf("expected %s to be included by default", kind)
		}
	}
	if len(ordered) != 3 {
		t.Fatalf("expected 3 ordered types, got %d", len(ordered))
	}
}

func TestParseRecapTypesRejectsUnknownKinds(t *testing.T) {
	if _, _, err := parseRecapTypes("commit,issue"); err == nil {
		t.Fatal("expected error for unknown type")
	}
}

func TestParseRecapReposDeduplicatesAndSplitsCSV(t *testing.T) {
	repos := parseRecapRepos([]string{"a/repo,b/repo", "b/repo", " c/repo "})
	if len(repos) != 3 {
		t.Fatalf("expected 3 repos, got %d", len(repos))
	}
	if repos[0] != "a/repo" || repos[1] != "b/repo" || repos[2] != "c/repo" {
		t.Fatalf("unexpected repo list: %#v", repos)
	}
}

func TestBuildRecapContextFormatsPayload(t *testing.T) {
	now := time.Date(2026, 3, 16, 7, 0, 0, 0, time.UTC)
	items := []data.Activity{
		{
			Type:      "commit",
			RepoName:  "a/repo",
			Title:     "Add recap context output",
			URL:       "https://example.com/commit/1",
			Branch:    sql.NullString{String: "main", Valid: true},
			CreatedAt: now,
		},
	}

	includedTypes := map[string]bool{"commit": true}
	context := buildRecapContext(items, 24, includedTypes, []string{"commit"}, nil, "Keep it concise.")

	if context.BasePrompt == "" {
		t.Fatal("expected base prompt to be set")
	}
	if context.CustomRule != "Keep it concise." {
		t.Fatalf("unexpected custom rule: %q", context.CustomRule)
	}
	if context.ItemCount != 1 {
		t.Fatalf("expected 1 item, got %d", context.ItemCount)
	}
	if context.FormattedActivities == "" {
		t.Fatal("expected formatted activities to be set")
	}
	if len(context.IncludedRepos) != 1 || context.IncludedRepos[0] != "a/repo" {
		t.Fatalf("unexpected included repos: %#v", context.IncludedRepos)
	}
	if len(context.Items) != 1 || context.Items[0].Branch == nil || *context.Items[0].Branch != "main" {
		t.Fatalf("unexpected serialized items: %#v", context.Items)
	}
}
