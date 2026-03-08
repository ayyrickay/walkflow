import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { ConversationTimeline } from "@/components/dashboard/conversation-timeline";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { conversationEvents, conversations, proposalAttempts } from "@/lib/db/schema";

export default async function CallDetailPage({ params }: { params: { id: string } }) {
  const user = await requireUser();

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, params.id), eq(conversations.userId, user.id)));
  if (!conversation) {
    notFound();
  }

  const attempts = await db
    .select()
    .from(proposalAttempts)
    .where(eq(proposalAttempts.conversationId, conversation.id));

  const events = await db
    .select()
    .from(conversationEvents)
    .where(eq(conversationEvents.conversationId, conversation.id));

  return (
    <section>
      <h1>Conversation {conversation.id}</h1>
      <p>Status: {conversation.status}</p>
      <p>Caller: {conversation.fromPhoneE164}</p>
      <ConversationTimeline attempts={attempts} events={events} />
    </section>
  );
}
