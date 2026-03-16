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
	if err := loadEnvWithPrecedence(); err != nil {
		return nil, err
	}

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

func loadEnvWithPrecedence() error {
	merged := map[string]string{}

	if path, err := globalEnvPath(); err != nil {
		return err
	} else if values, err := readEnvFile(path); err != nil {
		return err
	} else {
		for key, value := range values {
			merged[key] = value
		}
	}

	if values, err := readEnvFile(".env"); err != nil {
		return err
	} else {
		for key, value := range values {
			merged[key] = value
		}
	}

	for key, value := range merged {
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		if err := os.Setenv(key, value); err != nil {
			return fmt.Errorf("set %s from env file: %w", key, err)
		}
	}

	return nil
}

func readEnvFile(path string) (map[string]string, error) {
	values, err := godotenv.Read(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		return nil, fmt.Errorf("read env file %s: %w", path, err)
	}
	return values, nil
}

func globalEnvPath() (string, error) {
	if xdg := strings.TrimSpace(os.Getenv("XDG_CONFIG_HOME")); xdg != "" {
		return filepath.Join(xdg, "ghat", ".env"), nil
	}

	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("resolve home dir: %w", err)
	}
	return filepath.Join(homeDir, ".config", "ghat", ".env"), nil
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
