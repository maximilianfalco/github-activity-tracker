package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadEnvWithPrecedence(t *testing.T) {
	tempDir := t.TempDir()
	configDir := filepath.Join(tempDir, "config")
	t.Setenv("XDG_CONFIG_HOME", configDir)

	if err := os.MkdirAll(filepath.Join(configDir, "ghat"), 0o755); err != nil {
		t.Fatalf("create config dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(configDir, "ghat", ".env"), []byte("DATABASE_URL=global-db\nAUTH_GITHUB_ID=global-id\n"), 0o600); err != nil {
		t.Fatalf("write global env: %v", err)
	}
	if err := os.WriteFile(filepath.Join(tempDir, ".env"), []byte("DATABASE_URL=local-db\nOPENAI_API_KEY=local-key\n"), 0o600); err != nil {
		t.Fatalf("write local env: %v", err)
	}

	wd, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	defer func() {
		_ = os.Chdir(wd)
	}()
	if err := os.Chdir(tempDir); err != nil {
		t.Fatalf("chdir: %v", err)
	}

	t.Setenv("AUTH_GITHUB_ID", "process-id")
	t.Setenv("AUTH_SECRET", "process-secret")

	if err := loadEnvWithPrecedence(); err != nil {
		t.Fatalf("loadEnvWithPrecedence: %v", err)
	}

	if got := os.Getenv("DATABASE_URL"); got != "local-db" {
		t.Fatalf("expected local DATABASE_URL, got %q", got)
	}
	if got := os.Getenv("AUTH_GITHUB_ID"); got != "process-id" {
		t.Fatalf("expected process AUTH_GITHUB_ID, got %q", got)
	}
	if got := os.Getenv("OPENAI_API_KEY"); got != "local-key" {
		t.Fatalf("expected local OPENAI_API_KEY, got %q", got)
	}
	if got := os.Getenv("AUTH_SECRET"); got != "process-secret" {
		t.Fatalf("expected process AUTH_SECRET, got %q", got)
	}
}
