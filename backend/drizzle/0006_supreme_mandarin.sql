ALTER TABLE `document_snapshots` ADD `xml_content` text;--> statement-breakpoint
ALTER TABLE `document_snapshots` ADD `worldbuilding_data` text;--> statement-breakpoint
ALTER TABLE `document_snapshots` DROP COLUMN `y_doc_state`;--> statement-breakpoint
ALTER TABLE `document_snapshots` DROP COLUMN `state_vector`;