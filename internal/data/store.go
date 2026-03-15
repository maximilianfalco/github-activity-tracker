package data

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

const CacheTTL = 15 * time.Minute

type Store struct {
	db *sql.DB
}

type User struct {
	ID    string
	Name  string
	Email string
	Image string
}

type Account struct {
	ID          string
	UserID      string
	Provider    string
	AccessToken string
}

type UserAccount struct {
	User    User
	Account Account
}

type Activity struct {
	ID        string
	Type      string
	RepoName  string
	Title     string
	URL       string
	State     sql.NullString
	SHA       sql.NullString
	Branch    sql.NullString
	CreatedAt time.Time
	UpdatedAt sql.NullTime
	FetchedAt time.Time
}

type UserSettings struct {
	UserID             string
	DefaultWindow      int
	AutoRefresh        bool
	NotifyReviews      bool
	NotifyStatus       bool
	RecapIncludedRepos []string
	RecapCustomRule    string
}

type GitHubProfile struct {
	GitHubID int64
	Login    string
	Name     string
	Email    string
	Image    string
	Token    string
}

func Open(databaseURL string) (*Store, error) {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}

	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(30 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return &Store{db: db}, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) ListGitHubUsers(ctx context.Context) ([]UserAccount, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT u.id, COALESCE(u.name, ''), COALESCE(u.email, ''), COALESCE(u.image, ''),
		       a.id, a."userId", a.provider, COALESCE(a.access_token, '')
		FROM "User" u
		JOIN "Account" a ON a."userId" = u.id
		WHERE a.provider = 'github'
		ORDER BY u.name NULLS LAST, u.email NULLS LAST, u.id ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("list github users: %w", err)
	}
	defer rows.Close()

	var result []UserAccount
	for rows.Next() {
		var item UserAccount
		if err := rows.Scan(
			&item.User.ID,
			&item.User.Name,
			&item.User.Email,
			&item.User.Image,
			&item.Account.ID,
			&item.Account.UserID,
			&item.Account.Provider,
			&item.Account.AccessToken,
		); err != nil {
			return nil, fmt.Errorf("scan github user: %w", err)
		}
		result = append(result, item)
	}

	return result, rows.Err()
}

func (s *Store) UpsertGitHubToken(ctx context.Context, userID, accessToken string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE "Account"
		SET access_token = $2
		WHERE "userId" = $1 AND provider = 'github'
	`, userID, accessToken)
	if err != nil {
		return fmt.Errorf("update github token: %w", err)
	}
	return nil
}

func (s *Store) CreateGitHubUser(ctx context.Context, profile GitHubProfile) (UserAccount, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return UserAccount{}, fmt.Errorf("begin github user tx: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	var existing UserAccount
	err = tx.QueryRowContext(ctx, `
		SELECT u.id, COALESCE(u.name, ''), COALESCE(u.email, ''), COALESCE(u.image, ''),
		       a.id, a."userId", a.provider, COALESCE(a.access_token, '')
		FROM "Account" a
		JOIN "User" u ON u.id = a."userId"
		WHERE a.provider = 'github' AND a."providerAccountId" = $1
	`, fmt.Sprintf("%d", profile.GitHubID)).Scan(
		&existing.User.ID,
		&existing.User.Name,
		&existing.User.Email,
		&existing.User.Image,
		&existing.Account.ID,
		&existing.Account.UserID,
		&existing.Account.Provider,
		&existing.Account.AccessToken,
	)
	if err == nil {
		if _, err := tx.ExecContext(ctx, `
			UPDATE "Account"
			SET access_token = $2
			WHERE id = $1
		`, existing.Account.ID, profile.Token); err != nil {
			return UserAccount{}, fmt.Errorf("update existing account token: %w", err)
		}
		existing.Account.AccessToken = profile.Token
		if err := tx.Commit(); err != nil {
			return UserAccount{}, fmt.Errorf("commit existing github user tx: %w", err)
		}
		return existing, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return UserAccount{}, fmt.Errorf("lookup existing github account: %w", err)
	}

	userID := randomID("ghat_user")
	accountID := randomID("ghat_account")

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO "User" (id, name, email, image)
		VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''))
	`, userID, nullIfEmpty(profile.Name, profile.Login), profile.Email, profile.Image); err != nil {
		return UserAccount{}, fmt.Errorf("insert github user: %w", err)
	}

	if _, err := tx.ExecContext(ctx, `
		INSERT INTO "Account" (
			id, "userId", type, provider, "providerAccountId", access_token, scope
		) VALUES ($1, $2, 'oauth', 'github', $3, $4, 'repo read:user read:org')
	`, accountID, userID, fmt.Sprintf("%d", profile.GitHubID), profile.Token); err != nil {
		return UserAccount{}, fmt.Errorf("insert github account: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return UserAccount{}, fmt.Errorf("commit github user tx: %w", err)
	}

	return UserAccount{
		User: User{
			ID:    userID,
			Name:  nullIfEmpty(profile.Name, profile.Login),
			Email: profile.Email,
			Image: profile.Image,
		},
		Account: Account{
			ID:          accountID,
			UserID:      userID,
			Provider:    "github",
			AccessToken: profile.Token,
		},
	}, nil
}

func (s *Store) ClearGitHubToken(ctx context.Context, userID string) error {
	_, err := s.db.ExecContext(ctx, `
		UPDATE "Account"
		SET access_token = NULL
		WHERE "userId" = $1 AND provider = 'github'
	`, userID)
	if err != nil {
		return fmt.Errorf("clear github token: %w", err)
	}
	return nil
}

func (s *Store) ClearWebSessions(ctx context.Context, userID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM "Session" WHERE "userId" = $1`, userID)
	if err != nil {
		return fmt.Errorf("clear web sessions: %w", err)
	}
	return nil
}

func (s *Store) GetSettings(ctx context.Context, userID string) (UserSettings, error) {
	var settings UserSettings
	var recapIncludedReposJSON string
	settings.UserID = userID
	settings.DefaultWindow = 30
	settings.AutoRefresh = true
	settings.NotifyReviews = true
	settings.NotifyStatus = false
	settings.RecapIncludedRepos = []string{}
	settings.RecapCustomRule = ""

	err := s.db.QueryRowContext(ctx, `
		SELECT "userId", "defaultWindow", "autoRefresh", "notifyReviews", "notifyStatus",
		       COALESCE(array_to_json("recapIncludedRepos")::text, '[]'),
		       "recapCustomRule"
		FROM "UserSettings"
		WHERE "userId" = $1
	`, userID).Scan(
		&settings.UserID,
		&settings.DefaultWindow,
		&settings.AutoRefresh,
		&settings.NotifyReviews,
		&settings.NotifyStatus,
		&recapIncludedReposJSON,
		&settings.RecapCustomRule,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return settings, nil
		}
		return settings, fmt.Errorf("get settings: %w", err)
	}

	if err := json.Unmarshal([]byte(recapIncludedReposJSON), &settings.RecapIncludedRepos); err != nil {
		return settings, fmt.Errorf("decode recapIncludedRepos: %w", err)
	}

	return settings, nil
}

func (s *Store) SaveSettings(ctx context.Context, settings UserSettings) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO "UserSettings" (
			id, "userId", "defaultWindow", "autoRefresh", "notifyReviews", "notifyStatus",
			"recapIncludedRepos", "recapCustomRule"
		)
		VALUES ($1, $1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT ("userId")
		DO UPDATE SET
			"defaultWindow" = EXCLUDED."defaultWindow",
			"autoRefresh" = EXCLUDED."autoRefresh",
			"notifyReviews" = EXCLUDED."notifyReviews",
			"notifyStatus" = EXCLUDED."notifyStatus",
			"recapIncludedRepos" = EXCLUDED."recapIncludedRepos",
			"recapCustomRule" = EXCLUDED."recapCustomRule"
	`, settings.UserID, settings.DefaultWindow, settings.AutoRefresh, settings.NotifyReviews, settings.NotifyStatus, settings.RecapIncludedRepos, settings.RecapCustomRule)
	if err != nil {
		return fmt.Errorf("save settings: %w", err)
	}
	return nil
}

func (s *Store) LoadActivity(ctx context.Context, userID string, activityType string) ([]Activity, bool, error) {
	query := `
		SELECT id, type, "repoName", title, url, state, sha, branch, "createdAt", "updatedAt", "fetchedAt"
		FROM "ActivityCache"
		WHERE "userId" = $1
	`
	args := []any{userID}
	if activityType != "" {
		query += " AND type = $2"
		args = append(args, activityType)
	}
	query += ` ORDER BY "createdAt" DESC`

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, false, fmt.Errorf("load activity: %w", err)
	}
	defer rows.Close()

	var items []Activity
	for rows.Next() {
		var item Activity
		if err := rows.Scan(
			&item.ID,
			&item.Type,
			&item.RepoName,
			&item.Title,
			&item.URL,
			&item.State,
			&item.SHA,
			&item.Branch,
			&item.CreatedAt,
			&item.UpdatedAt,
			&item.FetchedAt,
		); err != nil {
			return nil, false, fmt.Errorf("scan activity: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, false, err
	}

	var fetchedAt sql.NullTime
	if err := s.db.QueryRowContext(ctx, `
		SELECT "fetchedAt"
		FROM "ActivityCache"
		WHERE "userId" = $1
		ORDER BY "fetchedAt" DESC
		LIMIT 1
	`, userID).Scan(&fetchedAt); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return nil, false, fmt.Errorf("load freshest cache time: %w", err)
	}

	stale := true
	if fetchedAt.Valid {
		stale = time.Since(fetchedAt.Time) >= CacheTTL
	}

	return items, stale, nil
}

func (s *Store) ReplaceActivity(ctx context.Context, userID string, activities []Activity) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin activity tx: %w", err)
	}
	defer func() {
		_ = tx.Rollback()
	}()

	if _, err := tx.ExecContext(ctx, `DELETE FROM "ActivityCache" WHERE "userId" = $1`, userID); err != nil {
		return fmt.Errorf("clear activity cache: %w", err)
	}

	for _, item := range activities {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO "ActivityCache" (
				id, "userId", type, "repoName", title, url, state, sha, branch, "createdAt", "updatedAt", "fetchedAt"
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		`, item.ID, userID, item.Type, item.RepoName, item.Title, item.URL, nullStringValue(item.State), nullStringValue(item.SHA), nullStringValue(item.Branch), item.CreatedAt, nullTimeValue(item.UpdatedAt), item.FetchedAt); err != nil {
			return fmt.Errorf("insert activity cache: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit activity tx: %w", err)
	}
	return nil
}

func nullStringValue(v sql.NullString) any {
	if !v.Valid {
		return nil
	}
	return v.String
}

func nullTimeValue(v sql.NullTime) any {
	if !v.Valid {
		return nil
	}
	return v.Time
}

func randomID(prefix string) string {
	buf := make([]byte, 8)
	if _, err := rand.Read(buf); err != nil {
		return fmt.Sprintf("%s_%d", prefix, time.Now().UnixNano())
	}
	return prefix + "_" + hex.EncodeToString(buf)
}

func nullIfEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
