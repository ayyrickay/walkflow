import type { InferSelectModel } from "drizzle-orm";

import type { conversationEvents, conversations, proposalAttempts } from "@/lib/db/schema";

export type ConversationRow = InferSelectModel<typeof conversations>;
export type ProposalAttemptRow = InferSelectModel<typeof proposalAttempts>;
export type ConversationEventRow = InferSelectModel<typeof conversationEvents>;
