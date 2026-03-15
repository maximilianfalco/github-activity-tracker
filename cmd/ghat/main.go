package main

import (
	"context"
	"fmt"
	"os"

	"github.com/maximilianfalco/github-activity-tracker/internal/app"
	"github.com/maximilianfalco/github-activity-tracker/internal/config"
)

func main() {
	ctx := context.Background()

	runtimeConfig, err := config.LoadRuntimeConfig()
	if err != nil {
		fmt.Fprintf(os.Stderr, "ghat: %v\n", err)
		os.Exit(1)
	}

	m, cleanup, err := app.NewModel(ctx, runtimeConfig)
	if err != nil {
		fmt.Fprintf(os.Stderr, "ghat: %v\n", err)
		os.Exit(1)
	}
	defer cleanup()

	if err := m.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "ghat: %v\n", err)
		os.Exit(1)
	}
}
