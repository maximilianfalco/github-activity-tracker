package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const basePrompt = `You are a developer productivity assistant. Summarize the user's GitHub activity from the last 24 hours into a concise daily standup recap. Group by repository. Keep it under 300 words. Focus on what was accomplished and what's in progress.

CRITICAL: Only reference activities, PRs, commits, reviews, and repositories that appear in the provided activity data. NEVER invent, fabricate, or hallucinate any PR links, ticket IDs, branch names, or activities that are not explicitly present in the data. If the user's custom instructions contain examples, treat them as formatting guidance only - do not reproduce example content as if it were real.`

func BasePrompt() string {
	return basePrompt
}

type Client struct {
	apiKey string
	http   *http.Client
}

func NewClient(apiKey string) *Client {
	return &Client{
		apiKey: strings.TrimSpace(apiKey),
		http: &http.Client{
			Timeout: 40 * time.Second,
		},
	}
}

func (c *Client) GenerateRecap(ctx context.Context, activities string, customRule string) (string, error) {
	if c.apiKey == "" {
		return "", errors.New("OPENAI_API_KEY is not configured")
	}

	system := basePrompt
	customRule = strings.TrimSpace(customRule)
	if customRule != "" {
		system += "\n\nThe user wants the recap formatted according to these style instructions (treat any URLs, PR numbers, or ticket IDs in these instructions as examples only, not real data):\n" + customRule
	}

	body := map[string]any{
		"model": "gpt-4o-mini",
		"input": []map[string]any{
			{
				"role": "system",
				"content": []map[string]string{
					{"type": "input_text", "text": system},
				},
			},
			{
				"role": "user",
				"content": []map[string]string{
					{"type": "input_text", "text": activities},
				},
			},
		},
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("marshal openai request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/responses", bytes.NewReader(payload))
	if err != nil {
		return "", fmt.Errorf("build openai request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("call openai: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("openai error: %s", resp.Status)
	}

	var decoded struct {
		Output []struct {
			Content []struct {
				Type string `json:"type"`
				Text string `json:"text"`
			} `json:"content"`
		} `json:"output"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		return "", fmt.Errorf("decode openai response: %w", err)
	}

	var builder strings.Builder
	for _, item := range decoded.Output {
		for _, content := range item.Content {
			if content.Type == "output_text" {
				builder.WriteString(content.Text)
			}
		}
	}
	result := strings.TrimSpace(builder.String())
	if result == "" {
		return "", errors.New("openai returned an empty recap")
	}
	return result, nil
}
