package app

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"charm.land/huh/v2"
	"charm.land/lipgloss/v2"
	"github.com/spf13/cobra"

	"github.com/maximilianfalco/github-activity-tracker/internal/ai"
	"github.com/maximilianfalco/github-activity-tracker/internal/auth"
	"github.com/maximilianfalco/github-activity-tracker/internal/config"
	"github.com/maximilianfalco/github-activity-tracker/internal/data"
	"github.com/maximilianfalco/github-activity-tracker/internal/domain"
	gh "github.com/maximilianfalco/github-activity-tracker/internal/github"
)

type CLI struct {
	ctx      context.Context
	store    *data.Store
	resolver *auth.Resolver
	aiClient *ai.Client
	runtime  *config.RuntimeConfig

	user       auth.ResolvedUser
	userList   []data.UserAccount
	settings   data.UserSettings
	activities []data.Activity
	stale      bool
}

type menuItem struct {
	Label  string
	Action func() error
}

var (
	titleStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("212")).Bold(true)
	sectionStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("229")).Bold(true)
	mutedStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("245"))
	successStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("42")).Bold(true)
	labelStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("111"))
	itemStyle    = lipgloss.NewStyle().PaddingLeft(2)
)

func NewModel(ctx context.Context, runtimeConfig *config.RuntimeConfig) (*CLI, func(), error) {
	store, err := data.Open(runtimeConfig.DatabaseURL)
	if err != nil {
		return nil, nil, err
	}
	cli := &CLI{
		ctx:      ctx,
		store:    store,
		resolver: auth.NewResolver(store, runtimeConfig.LocalConfig),
		aiClient: ai.NewClient(runtimeConfig.OpenAIAPIKey),
		runtime:  runtimeConfig,
	}
	return cli, func() { _ = store.Close() }, nil
}

func (c *CLI) Execute() error {
	var recapContextHours int
	var recapContextTypes string
	var recapContextRepos []string
	var recapContextJSON bool

	root := &cobra.Command{
		Use:          "ghat",
		Short:        "GitHub Activity Tracker CLI",
		SilenceUsage: true,
		RunE: func(cmd *cobra.Command, args []string) error {
			return c.runInteractive()
		},
	}

	loginCommand := &cobra.Command{
		Use:   "login",
		Short: "Sign in through GitHub OAuth device flow",
		RunE: func(cmd *cobra.Command, args []string) error {
			return c.login()
		},
	}

	recapContextCommand := &cobra.Command{
		Use:   "recap-context",
		Short: "Print recap context for external tools and agents",
		RunE: func(cmd *cobra.Command, args []string) error {
			if recapContextHours < 1 {
				return fmt.Errorf("--hours must be at least 1")
			}
			includedTypes, includedTypeList, err := parseRecapTypes(recapContextTypes)
			if err != nil {
				return err
			}
			return c.runWithState(func() error {
				includedRepos := parseRecapRepos(recapContextRepos)
				if len(includedRepos) == 0 {
					includedRepos = append([]string(nil), c.settings.RecapIncludedRepos...)
				}
				return c.printRecapContext(recapContextHours, includedTypes, includedTypeList, includedRepos, recapContextJSON)
			})
		},
	}
	recapContextCommand.Flags().IntVar(&recapContextHours, "hours", 24, "Recap window in hours")
	recapContextCommand.Flags().StringVar(&recapContextTypes, "types", "commit,pr,review", "Comma-separated activity types: commit,pr,review,all")
	recapContextCommand.Flags().StringSliceVar(&recapContextRepos, "repos", nil, "Comma-separated repo names to include; repeatable")
	recapContextCommand.Flags().BoolVar(&recapContextJSON, "json", false, "Emit recap context as JSON")

	root.AddCommand(
		loginCommand,
		&cobra.Command{Use: "overview", Short: "Show overview", RunE: func(cmd *cobra.Command, args []string) error { return c.runWithState(c.printOverview) }},
		&cobra.Command{Use: "commits", Short: "List commits", RunE: func(cmd *cobra.Command, args []string) error {
			return c.runWithState(func() error { return c.printActivities("commit") })
		}},
		&cobra.Command{Use: "prs", Aliases: []string{"pull-requests"}, Short: "List pull requests", RunE: func(cmd *cobra.Command, args []string) error {
			return c.runWithState(func() error { return c.printActivities("pr") })
		}},
		&cobra.Command{Use: "reviews", Short: "List reviews", RunE: func(cmd *cobra.Command, args []string) error {
			return c.runWithState(func() error { return c.printActivities("review") })
		}},
		&cobra.Command{Use: "repos", Short: "Show repo breakdown", RunE: func(cmd *cobra.Command, args []string) error { return c.runWithState(c.printRepos) }},
		&cobra.Command{Use: "recap", Short: "Generate recap", RunE: func(cmd *cobra.Command, args []string) error { return c.runWithState(c.printRecap) }},
		recapContextCommand,
		&cobra.Command{Use: "refresh", Short: "Refresh activity", RunE: func(cmd *cobra.Command, args []string) error {
			return c.runWithState(func() error { return c.refresh(true) })
		}},
	)

	return root.Execute()
}

func (c *CLI) runInteractive() error {
	c.printBanner()
	if err := c.loadState(); err != nil {
		return err
	}
	for {
		fmt.Println()
		fmt.Println(mutedStyle.Render("Signed in as " + userLabel(c.user.UserAccount)))
		items := []menuItem{
			{Label: "Login with GitHub", Action: c.login},
			{Label: "Overview", Action: c.printOverview},
			{Label: "Commits", Action: func() error { return c.printActivities("commit") }},
			{Label: "Pull Requests", Action: func() error { return c.printActivities("pr") }},
			{Label: "Reviews", Action: func() error { return c.printActivities("review") }},
			{Label: "Repos", Action: c.printRepos},
			{Label: "Recap", Action: c.printRecap},
			{Label: "Refresh GitHub data", Action: func() error { return c.refresh(true) }},
			{Label: "Settings", Action: c.settingsMenu},
			{Label: "Switch user", Action: c.switchUser},
			{Label: "Logout everywhere", Action: c.logout},
			{Label: "Quit", Action: func() error { return nil }},
		}

		index, err := c.selectIndex("Choose an action", labels(items))
		if err != nil {
			return err
		}
		if items[index].Label == "Quit" {
			fmt.Println(mutedStyle.Render("Bye."))
			return nil
		}
		if err := items[index].Action(); err != nil {
			return err
		}
	}
}

func (c *CLI) runWithState(fn func() error) error {
	if err := c.loadState(); err != nil {
		return err
	}
	return fn()
}

func (c *CLI) loadState() error {
	user, users, err := c.resolver.Resolve(c.ctx)
	if err != nil {
		if err == auth.ErrNoUsers {
			if err := c.bootstrapToken(); err != nil {
				return err
			}
			return c.loadState()
		}
		return err
	}
	c.user = user
	c.userList = users
	if c.user.NeedsToken {
		if err := c.promptForToken(); err != nil {
			return err
		}
		return c.loadState()
	}
	settings, err := c.store.GetSettings(c.ctx, c.user.User.ID)
	if err != nil {
		return err
	}
	activities, stale, err := c.store.LoadActivity(c.ctx, c.user.User.ID, "")
	if err != nil {
		return err
	}
	c.settings = settings
	c.activities = activities
	c.stale = stale
	return nil
}

func (c *CLI) bootstrapToken() error {
	fmt.Println(mutedStyle.Render("No shared GitHub user found. Starting CLI login."))
	return c.login()
}

func (c *CLI) promptForToken() error {
	fmt.Println(mutedStyle.Render(
		fmt.Sprintf("Selected user %s does not have a shared GitHub token.", userLabel(c.user.UserAccount)),
	))
	fmt.Println(mutedStyle.Render("Starting GitHub login in your browser to refresh the shared token."))
	return c.login()
}

func (c *CLI) login() error {
	clientID := strings.TrimSpace(c.runtime.AuthGitHubID)
	if clientID == "" {
		return fmt.Errorf("AUTH_GITHUB_ID is required for CLI OAuth login")
	}

	authorization, err := gh.StartDeviceFlow(c.ctx, clientID)
	if err != nil {
		return err
	}

	printSection("Authorize GitHub Activity Tracker")
	fmt.Println(itemStyle.Render(labelStyle.Render("Open: ") + authorization.VerificationURI))
	fmt.Println(itemStyle.Render(labelStyle.Render("Code: ") + titleStyle.Render(authorization.UserCode)))
	if err := openURL(authorization.VerificationURI); err == nil {
		fmt.Println(successStyle.Render("Browser opened automatically."))
	} else {
		fmt.Println(mutedStyle.Render(fmt.Sprintf("Could not open the browser automatically: %v", err)))
	}

	token, err := gh.PollDeviceFlow(c.ctx, clientID, authorization)
	if err != nil {
		return err
	}

	client := gh.NewClient(token.AccessToken)
	profile, err := client.FetchProfile(c.ctx)
	if err != nil {
		return err
	}

	user, err := c.resolver.BootstrapUser(c.ctx, profile)
	if err != nil {
		return err
	}

	fmt.Println()
	fmt.Println(successStyle.Render("Signed in as " + userLabel(user.UserAccount)))
	c.user = user

	users, err := c.store.ListGitHubUsers(c.ctx)
	if err != nil {
		return err
	}
	c.userList = users

	commits, prs, reviews, err := client.FetchAll(c.ctx, profile.Login)
	if err != nil {
		fmt.Println(mutedStyle.Render(fmt.Sprintf("Login succeeded, but the initial refresh failed: %v", err)))
		fmt.Println(mutedStyle.Render("You can retry any time with `ghat refresh`."))
		return nil
	}

	activities := gh.BuildCacheEntries(c.user.User.ID, commits, prs, reviews)
	if err := c.store.ReplaceActivity(c.ctx, c.user.User.ID, activities); err != nil {
		fmt.Println(mutedStyle.Render(fmt.Sprintf("Login succeeded, but saving refreshed activity failed: %v", err)))
		fmt.Println(mutedStyle.Render("You can retry any time with `ghat refresh`."))
		return nil
	}

	fmt.Println(successStyle.Render("GitHub activity cache initialized."))
	return c.loadState()
}

func (c *CLI) refresh(showMessage bool) error {
	client := gh.NewClient(c.user.Account.AccessToken)
	login, err := client.FetchLogin(c.ctx)
	if err != nil {
		return err
	}
	commits, prs, reviews, err := client.FetchAll(c.ctx, login)
	if err != nil {
		return err
	}
	activities := gh.BuildCacheEntries(c.user.User.ID, commits, prs, reviews)
	if err := c.store.ReplaceActivity(c.ctx, c.user.User.ID, activities); err != nil {
		return err
	}
	items, stale, err := c.store.LoadActivity(c.ctx, c.user.User.ID, "")
	if err != nil {
		return err
	}
	c.activities = items
	c.stale = stale
	if showMessage {
		fmt.Println()
		fmt.Println(successStyle.Render("Refreshed activity from GitHub."))
	}
	return nil
}

func (c *CLI) printOverview() error {
	overview := domain.BuildOverview(c.activities, c.stale)
	printSection("Overview")
	fmt.Println(itemStyle.Render(fmt.Sprintf("%s%d", labelStyle.Render("Commits (30d): "), overview.Commits30d)))
	fmt.Println(itemStyle.Render(fmt.Sprintf("%s%d", labelStyle.Render("Open PRs: "), overview.OpenPRs)))
	fmt.Println(itemStyle.Render(fmt.Sprintf("%s%d", labelStyle.Render("Merged PRs (30d): "), overview.MergedPRs)))
	fmt.Println(itemStyle.Render(fmt.Sprintf("%s%d", labelStyle.Render("Reviews Given (30d): "), overview.ReviewsGiven)))
	fmt.Println()
	fmt.Println(sectionStyle.Render("Recent Activity"))
	for _, item := range overview.RecentActivity {
		fmt.Println(itemStyle.Render("• " + renderActivityRow(item)))
	}
	return nil
}

func (c *CLI) printActivities(kind string) error {
	rangeLabel, err := c.selectString("Date range", []string{"1d", "7d", "30d", "90d"})
	if err != nil {
		return err
	}
	items := c.filterActivities(kind, rangeLabel)
	if kind == "pr" {
		state, err := c.selectString("PR state", []string{"all", "open", "merged", "closed"})
		if err != nil {
			return err
		}
		items = domain.FilterPRState(items, state)
	}
	printSection(strings.ToUpper(kind))
	for _, item := range items {
		fmt.Println(itemStyle.Render("• " + renderActivityRow(item)))
	}
	return c.maybeOpenSelection(items)
}

func (c *CLI) printRepos() error {
	repos := domain.BuildRepoBreakdown(c.activities)
	printSection("Repositories")
	for _, repo := range repos {
		fmt.Println(itemStyle.Render("• " + fmt.Sprintf("%s | total:%d commits:%d prs:%d last:%s", repo.RepoName, repo.Total, repo.Commits, repo.PRs, relativeTime(repo.LastActivityAt))))
	}
	return nil
}

func (c *CLI) printRecap() error {
	hoursLabel, err := c.selectString("Recap window", []string{"24", "36", "48", "60", "72"})
	if err != nil {
		return err
	}
	hours, _ := strconv.Atoi(hoursLabel)
	items, _ := domain.BuildRecap(c.activities, hours, map[string]bool{"commit": true, "pr": true, "review": true}, c.settings.RecapIncludedRepos)
	text, err := c.aiClient.GenerateRecap(c.ctx, domain.FormatActivitiesForAI(items), c.settings.RecapCustomRule)
	if err != nil {
		return err
	}
	printSection("Recap")
	fmt.Println(itemStyle.Render(text))
	return nil
}

func (c *CLI) settingsMenu() error {
	for {
		items := []string{
			fmt.Sprintf("Default window: %d", c.settings.DefaultWindow),
			fmt.Sprintf("Auto refresh: %t", c.settings.AutoRefresh),
			fmt.Sprintf("Notify reviews: %t", c.settings.NotifyReviews),
			fmt.Sprintf("Notify status: %t", c.settings.NotifyStatus),
			fmt.Sprintf("Recap repos: %s", recapRepoSummary(c.settings.RecapIncludedRepos)),
			"Edit recap custom rule",
			"Back",
		}
		index, err := c.selectIndex("Settings", items)
		if err != nil {
			return err
		}
		switch index {
		case 0:
			value, err := c.promptText("Default window (days)", strconv.Itoa(c.settings.DefaultWindow), false)
			if err != nil {
				return err
			}
			n, err := strconv.Atoi(value)
			if err != nil {
				return err
			}
			c.settings.DefaultWindow = n
		case 1:
			c.settings.AutoRefresh = !c.settings.AutoRefresh
		case 2:
			c.settings.NotifyReviews = !c.settings.NotifyReviews
		case 3:
			c.settings.NotifyStatus = !c.settings.NotifyStatus
		case 4:
			if err := c.editRecapRepos(); err != nil {
				return err
			}
		case 5:
			value, err := c.promptText("Recap custom rule", c.settings.RecapCustomRule, false)
			if err != nil {
				return err
			}
			c.settings.RecapCustomRule = value
		default:
			return nil
		}
		if err := c.store.SaveSettings(c.ctx, c.settings); err != nil {
			return err
		}
	}
}

func (c *CLI) switchUser() error {
	if len(c.userList) == 0 {
		return nil
	}
	userLabels := usersAsLabels(c.userList)
	index, err := c.selectIndex("Switch user", userLabels)
	if err != nil {
		return err
	}
	if err := c.resolver.SetSelectedUser(c.userList[index].User.ID); err != nil {
		return err
	}
	return c.loadState()
}

func (c *CLI) logout() error {
	if err := c.resolver.Logout(c.ctx, c.user.User.ID); err != nil {
		return err
	}
	fmt.Println()
	fmt.Println(successStyle.Render("Logged out everywhere."))
	c.user = auth.ResolvedUser{}
	c.userList = nil
	c.settings = data.UserSettings{}
	c.activities = nil
	c.stale = true
	return nil
}

func (c *CLI) filterActivities(kind string, rangeLabel string) []data.Activity {
	items := make([]data.Activity, 0)
	for _, item := range c.activities {
		if item.Type == kind {
			items = append(items, item)
		}
	}
	return domain.FilterByRange(items, rangeLabel)
}

func (c *CLI) maybeOpenSelection(items []data.Activity) error {
	if len(items) == 0 {
		return nil
	}
	choices := []string{"Back"}
	for _, item := range items {
		choices = append(choices, renderActivityRow(item))
	}
	index, err := c.selectIndex("Open item in browser", choices)
	if err != nil || index == 0 {
		return nil
	}
	return openURL(items[index-1].URL)
}

func (c *CLI) printBanner() {
	if path, err := exec.LookPath("figlet"); err == nil {
		cmd := exec.Command(path, "GITHUB")
		out, err := cmd.Output()
		if err == nil {
			fmt.Print(titleStyle.Render(string(out)))
			fmt.Println(titleStyle.Render("      ACTIVITY TRACKER"))
			return
		}
	}
	fmt.Println(titleStyle.Render("GITHUB ACTIVITY TRACKER"))
}

func (c *CLI) editRecapRepos() error {
	repos := uniqueSortedRepos(c.activities)
	if len(repos) == 0 {
		fmt.Println()
		fmt.Println(mutedStyle.Render("No repos found in cached activity yet. Run `ghat refresh` first."))
		return nil
	}

	selected := append([]string(nil), c.settings.RecapIncludedRepos...)
	options := make([]huh.Option[string], 0, len(repos))
	for _, repo := range repos {
		options = append(options, huh.NewOption(repo, repo))
	}

	field := huh.NewMultiSelect[string]().
		Title("Choose repos to include in recap").
		Description("Leave all unchecked to use all active repos. Use space to toggle selections.").
		Options(options...).
		Value(&selected)

	if err := c.runForm(field); err != nil {
		return err
	}

	c.settings.RecapIncludedRepos = selected
	return nil
}

func renderActivityRow(item data.Activity) string {
	state := ""
	if item.State.Valid {
		state = " [" + item.State.String + "]"
	}
	branch := ""
	if item.Branch.Valid {
		branch = " (" + item.Branch.String + ")"
	}
	return fmt.Sprintf("%s | %s | %s%s%s | %s", strings.ToUpper(item.Type), item.RepoName, truncateInline(item.Title, 52), state, branch, relativeTime(item.CreatedAt))
}

func labels(items []menuItem) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, item.Label)
	}
	return out
}

func uniqueSortedRepos(items []data.Activity) []string {
	set := map[string]bool{}
	for _, item := range items {
		set[item.RepoName] = true
	}
	repos := make([]string, 0, len(set))
	for repo := range set {
		repos = append(repos, repo)
	}
	// Small stable ordering so the menu doesn't jump around.
	for i := 0; i < len(repos)-1; i++ {
		for j := i + 1; j < len(repos); j++ {
			if repos[j] < repos[i] {
				repos[i], repos[j] = repos[j], repos[i]
			}
		}
	}
	return repos
}

func usersAsLabels(items []data.UserAccount) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, userLabel(item))
	}
	return out
}

func userLabel(item data.UserAccount) string {
	if item.User.Name != "" && item.User.Email != "" {
		return item.User.Name + " <" + item.User.Email + ">"
	}
	if item.User.Name != "" {
		return item.User.Name
	}
	if item.User.Email != "" {
		return item.User.Email
	}
	return item.User.ID
}

func recapRepoSummary(repos []string) string {
	if len(repos) == 0 {
		return "all active repos"
	}
	if len(repos) == 1 {
		return repos[0]
	}
	return fmt.Sprintf("%d selected", len(repos))
}

func printSection(title string) {
	fmt.Println()
	fmt.Println(sectionStyle.Render(title))
}

func relativeTime(t time.Time) string {
	diff := time.Since(t)
	switch {
	case diff < time.Minute:
		return "just now"
	case diff < time.Hour:
		return fmt.Sprintf("%dm ago", int(diff.Minutes()))
	case diff < 24*time.Hour:
		return fmt.Sprintf("%dh ago", int(diff.Hours()))
	default:
		return fmt.Sprintf("%dd ago", int(diff.Hours()/24))
	}
}

func truncateInline(value string, width int) string {
	value = strings.ReplaceAll(value, "\n", " ")
	if len(value) <= width {
		return value
	}
	if width <= 3 {
		return value[:width]
	}
	return value[:width-3] + "..."
}

func openURL(value string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", value)
	default:
		cmd = exec.Command("xdg-open", value)
	}
	return cmd.Start()
}

func (c *CLI) selectString(title string, items []string) (string, error) {
	index, err := c.selectIndex(title, items)
	if err != nil {
		return "", err
	}
	return items[index], nil
}

func (c *CLI) selectIndex(title string, items []string) (int, error) {
	var selected string
	options := make([]huh.Option[string], 0, len(items))
	for _, item := range items {
		options = append(options, huh.NewOption(item, item))
	}

	field := huh.NewSelect[string]().
		Title(title).
		Options(options...).
		Value(&selected)

	if err := c.runForm(field); err != nil {
		return 0, err
	}

	for i, item := range items {
		if item == selected {
			return i, nil
		}
	}
	return 0, fmt.Errorf("no selection made")
}

func (c *CLI) promptText(title, defaultValue string, secret bool) (string, error) {
	value := defaultValue
	input := huh.NewInput().
		Title(title).
		Value(&value)
	if secret {
		input = input.EchoMode(huh.EchoModePassword)
	}
	if err := c.runForm(input); err != nil {
		return "", err
	}
	return strings.TrimSpace(value), nil
}

func (c *CLI) runForm(field huh.Field) error {
	form := huh.NewForm(
		huh.NewGroup(field),
	)
	return form.Run()
}
