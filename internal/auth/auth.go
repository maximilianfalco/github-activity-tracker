package auth

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/maximilianfalco/github-activity-tracker/internal/config"
	"github.com/maximilianfalco/github-activity-tracker/internal/data"
)

type Resolver struct {
	store *data.Store
	local *config.LocalConfig
}

var ErrNoUsers = errors.New("no GitHub-backed users found in the shared database")

type ResolvedUser struct {
	data.UserAccount
	NeedsToken bool
}

func NewResolver(store *data.Store, local *config.LocalConfig) *Resolver {
	return &Resolver{store: store, local: local}
}

func (r *Resolver) Resolve(ctx context.Context) (ResolvedUser, []data.UserAccount, error) {
	users, err := r.store.ListGitHubUsers(ctx)
	if err != nil {
		return ResolvedUser{}, nil, err
	}
	if len(users) == 0 {
		return ResolvedUser{}, nil, ErrNoUsers
	}

	selectedID := strings.TrimSpace(r.local.SelectedUserID)
	if selectedID != "" {
		for _, item := range users {
			if item.User.ID == selectedID {
				if strings.TrimSpace(item.Account.AccessToken) != "" {
					return wrapResolved(item), users, nil
				}

				for _, candidate := range users {
					if strings.TrimSpace(candidate.Account.AccessToken) != "" {
						r.local.SelectedUserID = candidate.User.ID
						_ = config.SaveLocalConfig(r.local)
						return wrapResolved(candidate), users, nil
					}
				}

				return wrapResolved(item), users, nil
			}
		}
	}

	if len(users) == 1 {
		r.local.SelectedUserID = users[0].User.ID
		_ = config.SaveLocalConfig(r.local)
		return wrapResolved(users[0]), users, nil
	}

	for _, item := range users {
		if item.Account.AccessToken != "" {
			r.local.SelectedUserID = item.User.ID
			_ = config.SaveLocalConfig(r.local)
			return wrapResolved(item), users, nil
		}
	}

	r.local.SelectedUserID = users[0].User.ID
	_ = config.SaveLocalConfig(r.local)
	return wrapResolved(users[0]), users, nil
}

func wrapResolved(item data.UserAccount) ResolvedUser {
	return ResolvedUser{
		UserAccount: item,
		NeedsToken:  strings.TrimSpace(item.Account.AccessToken) == "",
	}
}

func (r *Resolver) SetSelectedUser(userID string) error {
	r.local.SelectedUserID = userID
	return config.SaveLocalConfig(r.local)
}

func (r *Resolver) SaveToken(ctx context.Context, userID, token string) error {
	if strings.TrimSpace(token) == "" {
		return errors.New("token cannot be empty")
	}
	if err := r.store.UpsertGitHubToken(ctx, userID, strings.TrimSpace(token)); err != nil {
		return err
	}
	r.local.SelectedUserID = userID
	return config.SaveLocalConfig(r.local)
}

func (r *Resolver) BootstrapUser(ctx context.Context, profile data.GitHubProfile) (ResolvedUser, error) {
	account, err := r.store.CreateGitHubUser(ctx, profile)
	if err != nil {
		return ResolvedUser{}, err
	}
	r.local.SelectedUserID = account.User.ID
	if err := config.SaveLocalConfig(r.local); err != nil {
		return ResolvedUser{}, err
	}
	return wrapResolved(account), nil
}

func (r *Resolver) Logout(ctx context.Context, userID string) error {
	if err := r.store.ClearGitHubToken(ctx, userID); err != nil {
		return err
	}
	if err := r.store.ClearWebSessions(ctx, userID); err != nil {
		return fmt.Errorf("clear sessions after logout: %w", err)
	}
	return nil
}
