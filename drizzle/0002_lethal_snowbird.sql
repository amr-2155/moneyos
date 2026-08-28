CREATE TABLE `savings_contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`savings_goal_id` text NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`savings_goal_id`) REFERENCES `savings_goals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `savings_contributions_goal_idx` ON `savings_contributions` (`savings_goal_id`);--> statement-breakpoint
CREATE INDEX `savings_contributions_user_idx` ON `savings_contributions` (`user_id`);--> statement-breakpoint
ALTER TABLE `budgets` ADD `is_archived` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `budgets_user_period_idx` ON `budgets` (`user_id`,`period`);--> statement-breakpoint
ALTER TABLE `savings_goals` ADD `description` text;