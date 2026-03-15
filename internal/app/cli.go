package app

import (
	"context"
	"fmt"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/manifoldco/promptui"
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
	root := &cobra.Command{
		Use:   "ghat",
		Short: "GitHub Activity Tracker CLI",
		RunE: func(cmd *cobra.Command, args []string) error {
			return c.runInteractive()
		},
	}

	root.AddCommand(
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
		fmt.Printf("\nSigned in as %s\n", userLabel(c.user.UserAccount))
		items := []menuItem{
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

		selectPrompt := &promptui.Select{
			Label: "Choose an action",
			Items: labels(items),
			Size:  len(items),
		}
		index, _, err := selectPrompt.Run()
		if err != nil {
			return err
		}
		if items[index].Label == "Quit" {
			fmt.Println("Bye.")
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
			return c.bootstrapToken()
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
	fmt.Println("No shared GitHub user found. Paste a GitHub PAT to bootstrap local auth.")
	prompt := &promptui.Prompt{Label: "GitHub PAT", Mask: '*'}
	token, err := prompt.Run()
	if err != nil {
		return err
	}
	client := gh.NewClient(strings.TrimSpace(token))
	profile, err := client.FetchProfile(c.ctx)
	if err != nil {
		return err
	}
	user, err := c.resolver.BootstrapUser(c.ctx, profile)
	if err != nil {
		return err
	}
	c.user = user
	c.userList = []data.UserAccount{user.UserAccount}
	return nil
}

func (c *CLI) promptForToken() error {
	fmt.Printf("Selected user %s does not have a shared GitHub token.\n", userLabel(c.user.UserAccount))
	prompt := &promptui.Prompt{Label: "GitHub PAT", Mask: '*'}
	token, err := prompt.Run()
	if err != nil {
		return err
	}
	return c.resolver.SaveToken(c.ctx, c.user.User.ID, token)
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
		fmt.Println("\nRefreshed activity from GitHub.")
	}
	return nil
}

func (c *CLI) printOverview() error {
	overview := domain.BuildOverview(c.activities, c.stale)
	fmt.Println()
	fmt.Println("Overview")
	fmt.Printf("Commits (30d): %d\n", overview.Commits30d)
	fmt.Printf("Open PRs: %d\n", overview.OpenPRs)
	fmt.Printf("Merged PRs (30d): %d\n", overview.MergedPRs)
	fmt.Printf("Reviews Given (30d): %d\n", overview.ReviewsGiven)
	fmt.Println("\nRecent Activity")
	for _, item := range overview.RecentActivity {
		fmt.Println(" -", renderActivityRow(item))
	}
	return nil
}

func (c *CLI) printActivities(kind string) error {
	rangePrompt := &promptui.Select{Label: "Date range", Items: []string{"1d", "7d", "30d", "90d"}}
	_, rangeLabel, err := rangePrompt.Run()
	if err != nil {
		return err
	}
	items := c.filterActivities(kind, rangeLabel)
	if kind == "pr" {
		statePrompt := &promptui.Select{Label: "PR state", Items: []string{"all", "open", "merged", "closed"}}
		_, state, err := statePrompt.Run()
		if err != nil {
			return err
		}
		items = domain.FilterPRState(items, state)
	}
	fmt.Println()
	fmt.Println(strings.ToUpper(kind))
	for _, item := range items {
		fmt.Println(" -", renderActivityRow(item))
	}
	return c.maybeOpenSelection(items)
}

func (c *CLI) printRepos() error {
	repos := domain.BuildRepoBreakdown(c.activities)
	fmt.Println("\nRepositories")
	for _, repo := range repos {
		fmt.Printf(" - %s | total:%d commits:%d prs:%d last:%s\n", repo.RepoName, repo.Total, repo.Commits, repo.PRs, relativeTime(repo.LastActivityAt))
	}
	return nil
}

func (c *CLI) printRecap() error {
	hoursPrompt := &promptui.Select{Label: "Recap window", Items: []string{"24", "36", "48", "60", "72"}}
	_, hoursLabel, err := hoursPrompt.Run()
	if err != nil {
		return err
	}
	hours, _ := strconv.Atoi(hoursLabel)
	items, _ := domain.BuildRecap(c.activities, hours, map[string]bool{"commit": true, "pr": true, "review": true}, c.settings.RecapIncludedRepos)
	text, err := c.aiClient.GenerateRecap(c.ctx, domain.FormatActivitiesForAI(items), c.settings.RecapCustomRule)
	if err != nil {
		return err
	}
	fmt.Println()
	fmt.Println(text)
	return nil
}

func (c *CLI) settingsMenu() error {
	for {
		items := []string{
			fmt.Sprintf("Default window: %d", c.settings.DefaultWindow),
			fmt.Sprintf("Auto refresh: %t", c.settings.AutoRefresh),
			fmt.Sprintf("Notify reviews: %t", c.settings.NotifyReviews),
			fmt.Sprintf("Notify status: %t", c.settings.NotifyStatus),
			"Edit recap custom rule",
			"Back",
		}
		selectPrompt := &promptui.Select{Label: "Settings", Items: items, Size: len(items)}
		index, _, err := selectPrompt.Run()
		if err != nil {
			return err
		}
		switch index {
		case 0:
			prompt := &promptui.Prompt{Label: "Default window (days)", Default: strconv.Itoa(c.settings.DefaultWindow)}
			value, err := prompt.Run()
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
			prompt := &promptui.Prompt{Label: "Recap custom rule", Default: c.settings.RecapCustomRule}
			value, err := prompt.Run()
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
	selectPrompt := &promptui.Select{Label: "Switch user", Items: userLabels, Size: len(c.userList)}
	index, _, err := selectPrompt.Run()
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
	fmt.Println("\nLogged out everywhere.")
	return c.loadState()
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
	selectPrompt := &promptui.Select{Label: "Open item in browser", Items: choices, Size: min(10, len(choices))}
	index, _, err := selectPrompt.Run()
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
			fmt.Println(string(out))
			fmt.Println("      ACTIVITY TRACKER")
			return
		}
	}
	fmt.Println("GITHUB ACTIVITY TRACKER")
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

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
