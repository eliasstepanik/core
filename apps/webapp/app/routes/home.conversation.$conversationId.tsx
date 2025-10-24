import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "@remix-run/server-runtime";
import { sort } from "fast-sort";

import { useParams, useRevalidator, useNavigate } from "@remix-run/react";
import { parse } from "@conform-to/zod";
import {
  requireUserId,
  requireUser,
  requireWorkpace,
} from "~/services/session.server";
import {
  getConversationAndHistory,
  getCurrentConversationRun,
  stopConversation,
  createConversation,
  CreateConversationSchema,
} from "~/services/conversation.server";
import { type ConversationHistory } from "@core/database";
import {
  ConversationItem,
  ConversationTextarea,
  StreamingConversation,
} from "~/components/conversation";
import { useTypedLoaderData } from "remix-typedjson";
import React from "react";
import { ScrollAreaWithAutoScroll } from "~/components/use-auto-scroll";
import { PageHeader } from "~/components/common/page-header";
import { Plus } from "lucide-react";

import { json } from "@remix-run/node";
import { env } from "~/env.server";

// Example loader accessing params
export async function loader({ params, request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const workspace = await requireWorkpace(request);
  const conversation = await getConversationAndHistory(
    params.conversationId as string,
    user.id,
  );

  if (!conversation) {
    throw new Error("No conversation found");
  }

  const run = await getCurrentConversationRun(conversation.id, workspace.id);

  return { conversation, run, apiURL: env.TRIGGER_API_URL ?? undefined };
}

// Example action accessing params
export async function action({ params, request }: ActionFunctionArgs) {
  if (request.method.toUpperCase() !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const userId = await requireUserId(request);
  const workspace = await requireWorkpace(request);
  const formData = await request.formData();
  const { conversationId } = params;

  if (!conversationId) {
    throw new Error("No conversation");
  }

  // Check if this is a stop request (isLoading = true means stop button was clicked)
  const message = formData.get("message");

  // If no message, it's a stop request
  if (!message) {
    const result = await stopConversation(conversationId, workspace.id);
    return json(result);
  }

  // Otherwise, create a new conversation message
  const submission = parse(formData, { schema: CreateConversationSchema });

  if (!submission.value || submission.intent !== "submit") {
    return json(submission);
  }

  const conversation = await createConversation(workspace?.id, userId, {
    message: submission.value.message,
    title: submission.value.title,
    conversationId: submission.value.conversationId,
  });

  return json({ conversation });
}

// Accessing params in the component
export default function SingleConversation() {
  const { conversation, run, apiURL } = useTypedLoaderData<typeof loader>();
  const conversationHistory = conversation.ConversationHistory;

  const [conversationResponse, setConversationResponse] = React.useState<
    { conversationHistoryId: string; id: string; token: string } | undefined
  >(run);

  const { conversationId } = useParams();
  const revalidator = useRevalidator();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (run) {
      setConversationResponse(run);
    }
  }, [run]);

  const conversations = React.useMemo(() => {
    const lastConversationHistoryId =
      conversationResponse?.conversationHistoryId;

    // First sort the conversation history by creation time
    const sortedConversationHistory = sort(conversationHistory).asc(
      (ch) => ch.createdAt,
    );

    const lastIndex = sortedConversationHistory.findIndex(
      (item) => item.id === lastConversationHistoryId,
    );

    // Filter out any conversation history items that come after the lastConversationHistoryId
    return lastConversationHistoryId
      ? sortedConversationHistory.filter((_ch, currentIndex: number) => {
          return currentIndex <= lastIndex;
        })
      : sortedConversationHistory;
  }, [conversationResponse, conversationHistory]);

  const getConversations = () => {
    return (
      <>
        {conversations.map((ch: ConversationHistory) => {
          return <ConversationItem key={ch.id} conversationHistory={ch} />;
        })}
      </>
    );
  };

  if (typeof window === "undefined") {
    return null;
  }

  return (
    <>
      <PageHeader
        title="Conversation"
        breadcrumbs={[
          { label: "Conversations", href: "/home/conversation" },
          { label: conversation.title || "Untitled" },
        ]}
        actions={[
          {
            label: "New conversation",
            icon: <Plus size={14} />,
            onClick: () => navigate("/home/conversation"),
            variant: "secondary",
          },
        ]}
      />

      <div className="relative flex h-[calc(100vh_-_56px)] w-full flex-col items-center justify-center overflow-auto">
        <div className="flex h-[calc(100vh_-_80px)] w-full flex-col justify-end overflow-hidden">
          <ScrollAreaWithAutoScroll>
            {getConversations()}
            {conversationResponse && (
              <StreamingConversation
                runId={conversationResponse.id}
                token={conversationResponse.token}
                afterStreaming={() => {
                  setConversationResponse(undefined);
                  revalidator.revalidate();
                }}
                apiURL={apiURL}
              />
            )}
          </ScrollAreaWithAutoScroll>

          <div className="flex w-full flex-col items-center">
            <div className="w-full max-w-[80ch] px-1 pr-2">
              {conversation?.status !== "need_approval" && (
                <ConversationTextarea
                  conversationId={conversationId as string}
                  className="bg-background-3 w-full border-1 border-gray-300"
                  isLoading={
                    !!conversationResponse || conversation?.status === "running"
                  }
                  onConversationCreated={(conversation) => {
                    if (conversation) {
                      setConversationResponse({
                        conversationHistoryId:
                          conversation.conversationHistoryId,
                        id: conversation.id,
                        token: conversation.token,
                      });
                    }
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
