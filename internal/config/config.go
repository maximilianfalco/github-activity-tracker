package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/joho/godotenv"
)

type RuntimeConfig struct {
	DatabaseURL  string
	OpenAIAPIKey string
	AuthGitHubID string
	LocalConfig  *LocalConfig
}

type LocalConfig struct {
	SelectedUserID string `json:"selectedUserId"`
	LastView       string `json:"lastView"`
}

func LoadRuntimeConfig() (*RuntimeConfig, error) {
	_ = godotenv.Overload()

	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if databaseURL == "" {
		return nil, errors.New("DATABASE_URL is required")
	}

	localConfig, err := LoadLocalConfig()
	if err != nil {
		return nil, err
	}

	return &RuntimeConfig{
		DatabaseURL:  databaseURL,
		OpenAIAPIKey: strings.TrimSpace(os.Getenv("OPENAI_API_KEY")),
		AuthGitHubID: strings.TrimSpace(os.Getenv("AUTH_GITHUB_ID")),
		LocalConfig:  localConfig,
	}, nil
}

func localConfigPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("resolve user config dir: %w", err)
	}
	return filepath.Join(dir, "ghat", "config.json"), nil
}

func LoadLocalConfig() (*LocalConfig, error) {
	path, err := localConfigPath()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return &LocalConfig{}, nil
		}
		return nil, fmt.Errorf("read local config: %w", err)
	}

	cfg := &LocalConfig{}
	if err := json.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("parse local config: %w", err)
	}
	return cfg, nil
}

func SaveLocalConfig(cfg *LocalConfig) error {
	path, err := localConfigPath()
	if err != nil {
		return err
	}

	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return fmt.Errorf("create local config dir: %w", err)
	}

	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("encode local config: %w", err)
	}

	if err := os.WriteFile(path, data, 0o600); err != nil {
		return fmt.Errorf("write local config: %w", err)
	}

	return nil
}
