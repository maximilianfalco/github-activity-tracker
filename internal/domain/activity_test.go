package domain

import (
	"database/sql"
	"testing"
	"time"

	"github.com/maximilianfalco/github-activity-tracker/internal/data"
)

func TestBuildOverviewCounts(t *testing.T) {
	now := time.Now()
	items := []data.Activity{
		{Type: "commit", CreatedAt: now.Add(-2 * time.Hour)},
		{Type: "pr", CreatedAt: now.Add(-3 * time.Hour), State: sql.NullString{String: "open", Valid: true}},
		{Type: "pr", CreatedAt: now.Add(-4 * time.Hour), State: sql.NullString{String: "merged", Valid: true}},
		{Type: "review", CreatedAt: now.Add(-5 * time.Hour)},
	}

	overview := BuildOverview(items, false)

	if overview.Commits30d != 1 {
		t.Fatalf("expected 1 commit, got %d", overview.Commits30d)
	}
	if overview.OpenPRs != 1 {
		t.Fatalf("expected 1 open pr, got %d", overview.OpenPRs)
	}
	if overview.MergedPRs != 1 {
		t.Fatalf("expected 1 merged pr, got %d", overview.MergedPRs)
	}
	if overview.ReviewsGiven != 1 {
		t.Fatalf("expected 1 review, got %d", overview.ReviewsGiven)
	}
}

func TestBuildRecapFiltersTypesAndRepos(t *testing.T) {
	now := time.Now()
	items := []data.Activity{
		{Type: "commit", RepoName: "a/repo", CreatedAt: now.Add(-2 * time.Hour)},
		{Type: "pr", RepoName: "b/repo", CreatedAt: now.Add(-2 * time.Hour)},
	}

	filtered, allRepos := BuildRecap(items, 24, map[string]bool{"commit": true}, []string{"a/repo"})

	if len(filtered) != 1 {
		t.Fatalf("expected 1 filtered item, got %d", len(filtered))
	}
	if filtered[0].RepoName != "a/repo" {
		t.Fatalf("expected a/repo, got %s", filtered[0].RepoName)
	}
	if len(allRepos) != 2 {
		t.Fatalf("expected 2 repos in allRepos, got %d", len(allRepos))
	}
}
