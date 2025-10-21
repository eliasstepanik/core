import React, { useEffect, useState } from "react";
import { EventSource, type ErrorEvent } from "eventsource";

const getTriggerAPIURL = (apiURL?: string) => {
  return (
    (apiURL?.includes("trigger-webapp") ? "http://localhost:8030" : apiURL) ??
    "https://trigger.heysol.ai"
  );
};

export const useTriggerStream = (
  runId: string,
  token: string,
  apiURL?: string,
  afterStreaming?: (finalMessage: string) => void,
) => {
  // Need to fix this later
  const baseURL = React.useMemo(() => getTriggerAPIURL(apiURL), [apiURL]);
  const [error, setError] = useState<ErrorEvent | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    startStreaming();
  }, []);

  const startStreaming = () => {
    const eventSource = new EventSource(
      `${baseURL}/realtime/v1/streams/${runId}/messages`,
      {
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            headers: {
              ...init.headers,
              Authorization: `Bearer ${token}`,
            },
          }),
      },
    );

    eventSource.onmessage = (event) => {
      try {
        const eventData = JSON.parse(event.data);

        if (eventData.type.includes("MESSAGE_")) {
          setMessage((prevMessage) => prevMessage + eventData.message);
        }
      } catch (e) {
        console.error("Failed to parse message:", e);
      }
    };

    eventSource.onerror = (err) => {
      console.error("EventSource failed:", err);
      setError(err);
      eventSource.close();
      if (afterStreaming) {
        afterStreaming(message);
      }
    };
  };

  return { error, message, actionMessages: [] };
};
