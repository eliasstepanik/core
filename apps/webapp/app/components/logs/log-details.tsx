import { useState, useEffect, type ReactNode } from "react";
import { useFetcher } from "@remix-run/react";
import { AlertCircle, File, Loader2, MessageSquare } from "lucide-react";
import { Badge, BadgeColor } from "../ui/badge";
import { type LogItem } from "~/hooks/use-logs";
import Markdown from "react-markdown";
import { getIconForAuthorise } from "../icon-utils";
import { cn, formatString } from "~/lib/utils";
import { getStatusColor } from "./utils";
import { format } from "date-fns";
import { SpaceDropdown } from "../spaces/space-dropdown";

interface LogDetailsProps {
  log: LogItem;
}

interface PropertyItemProps {
  label: string;
  value?: string | ReactNode;
  icon?: ReactNode;
  variant?: "default" | "secondary" | "outline" | "status";
  statusColor?: string;
  className?: string;
}

function PropertyItem({
  label,
  value,
  icon,
  variant = "secondary",
  statusColor,
  className,
}: PropertyItemProps) {
  if (!value) return null;

  return (
    <div className="flex items-center py-1 !text-base">
      <span className="text-muted-foreground min-w-[120px]">{label}</span>

      {variant === "status" ? (
        <Badge
          className={cn(
            "text-foreground h-7 items-center gap-2 rounded !bg-transparent px-4.5 !text-base",
            className,
          )}
        >
          {statusColor && (
            <BadgeColor className={cn(statusColor, "h-2.5 w-2.5")} />
          )}
          {value}
        </Badge>
      ) : (
        <Badge
          variant={variant}
          className={cn(
            "h-7 items-center gap-2 rounded bg-transparent px-4 !text-base",
            className,
          )}
        >
          {icon}
          {value}
        </Badge>
      )}
    </div>
  );
}

interface EpisodeFact {
  uuid: string;
  fact: string;
  createdAt: string;
  validAt: string;
  attributes: any;
}

interface EpisodeFactsResponse {
  facts: EpisodeFact[];
  invalidFacts: EpisodeFact[];
}

function getStatusValue(status: string) {
  if (status === "PENDING") {
    return formatString("IN QUEUE");
  }

  return formatString(status);
}

export function LogDetails({ log }: LogDetailsProps) {
  const [facts, setFacts] = useState<any[]>([]);
  const [invalidFacts, setInvalidFacts] = useState<any[]>([]);
  const [factsLoading, setFactsLoading] = useState(false);
  const fetcher = useFetcher<EpisodeFactsResponse>();

  // Fetch episode facts when dialog opens and episodeUUID exists
  useEffect(() => {
    if (log.data?.type === "DOCUMENT" && log.data?.episodes?.length > 0) {
      setFactsLoading(true);
      setFacts([]);
      // Fetch facts for all episodes in DOCUMENT type
      Promise.all(
        log.data.episodes.map((episodeId: string) =>
          fetch(`/api/v1/episodes/${episodeId}/facts`).then((res) =>
            res.json(),
          ),
        ),
      )
        .then((results) => {
          const allFacts = results.flatMap((result) => result.facts || []);
          const allInvalidFacts = results.flatMap(
            (result) => result.invalidFacts || [],
          );
          setFacts(allFacts);
          setInvalidFacts(allInvalidFacts);
          setFactsLoading(false);
        })
        .catch(() => {
          setFactsLoading(false);
        });
    } else if (log.episodeUUID) {
      setFactsLoading(true);
      fetcher.load(`/api/v1/episodes/${log.episodeUUID}/facts`);
    } else {
      setFacts([]);
      setInvalidFacts([]);
    }
  }, [log.episodeUUID, log.data?.type, log.data?.episodes, facts.length]);

  // Handle fetcher response
  useEffect(() => {
    if (fetcher.data && fetcher.state === "idle") {
      setFactsLoading(false);
      const response = fetcher.data;
      setFacts(response.facts);
      setInvalidFacts(response.invalidFacts);
    }
  }, [fetcher.data, fetcher.state]);

  return (
    <div className="flex h-full w-full flex-col items-center overflow-auto">
      <div className="max-w-4xl">
        <div className="mt-5 mb-5 px-4">
          <div className="space-y-1">
            <PropertyItem
              label="Session Id"
              value={log.data?.sessionId?.toLowerCase()}
              variant="secondary"
            />
            <PropertyItem
              label="Type"
              value={formatString(
                log.data?.type ? log.data.type.toLowerCase() : "conversation",
              )}
              icon={
                log.data?.type === "CONVERSATION" ? (
                  <MessageSquare size={16} />
                ) : (
                  <File size={16} />
                )
              }
              variant="secondary"
            />
            <PropertyItem
              label="Source"
              value={formatString(log.source?.toLowerCase())}
              icon={
                log.source &&
                getIconForAuthorise(log.source.toLowerCase(), 16, undefined)
              }
              variant="secondary"
            />

            <PropertyItem
              label="Status"
              value={getStatusValue(log.status)}
              variant="status"
              statusColor={log.status && getStatusColor(log.status)}
            />

            {/* Space Assignment for CONVERSATION type */}
            {log.data.type.toLowerCase() === "conversation" &&
              log?.episodeUUID && (
                <div className="mt-2 flex items-start py-1">
                  <span className="text-muted-foreground min-w-[120px]">
                    Spaces
                  </span>

                  <SpaceDropdown
                    className="px-3"
                    episodeIds={[log.episodeUUID]}
                    selectedSpaceIds={log.spaceIds || []}
                  />
                </div>
              )}
          </div>
        </div>

        {/* Error Details */}
        {log.error && (
          <div className="mb-6 px-4">
            <div className="bg-destructive/10 rounded-md p-3">
              <div className="flex items-start gap-2 text-red-600">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <p className="text-sm break-words whitespace-pre-wrap">
                  {log.error}
                </p>
              </div>
            </div>
          </div>
        )}

        {log.data?.type === "CONVERSATION" && (
          <div className="flex flex-col items-center p-4 pt-0">
            {/* Log Content */}
            <div className="mb-4 w-full break-words whitespace-pre-wrap">
              <div className="rounded-md">
                <Markdown>{log.ingestText}</Markdown>
              </div>
            </div>
          </div>
        )}

        {/* Episodes List for DOCUMENT type */}
        {log.data?.type === "DOCUMENT" && log.episodeDetails?.length > 0 && (
          <div className="mb-6 px-4">
            <div className="mb-2 flex w-full items-center justify-between font-medium">
              <span>Episodes ({log.episodeDetails.length})</span>
            </div>
            <div className="flex flex-col gap-3">
              {log.episodeDetails.map((episode: any, index: number) => (
                <div
                  key={episode.uuid}
                  className="bg-grayAlpha-100 flex flex-col gap-3 rounded-md p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-muted-foreground text-xs">
                        Episode {index + 1}
                      </span>
                      <span className="truncate font-mono text-xs">
                        {episode.uuid}
                      </span>
                    </div>
                    <div className="flex-shrink-0">
                      <SpaceDropdown
                        episodeIds={[episode.uuid]}
                        selectedSpaceIds={episode.spaceIds || []}
                      />
                    </div>
                  </div>
                  {/* Episode Content */}
                  <div className="border-grayAlpha-200 border-t pt-3">
                    <div className="text-muted-foreground mb-1 text-xs">
                      Content
                    </div>
                    <div className="text-sm break-words whitespace-pre-wrap">
                      <Markdown>{episode.content}</Markdown>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Episode Facts */}
        <div className="mb-6 px-4">
          <div className="mb-2 flex w-full items-center justify-between font-medium">
            <span>Facts</span>
          </div>
          <div className="rounded-md">
            {factsLoading ? (
              <div className="flex items-center justify-center gap-2 p-4 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : facts.length > 0 ? (
              <div className="flex flex-col gap-1">
                {facts.map((fact) => (
                  <div
                    key={fact.uuid}
                    className="bg-grayAlpha-100 flex items-center justify-between gap-2 rounded-md p-3"
                  >
                    <p className="text-sm">{fact.fact}</p>
                    <div className="text-muted-foreground flex shrink-0 items-center gap-2 text-xs">
                      <span>
                        Valid: {format(new Date(fact.validAt), "dd/MM/yyyy")}
                      </span>
                      {fact.invalidAt && (
                        <span>
                          Invalid:{" "}
                          {format(new Date(fact.invalidAt), "dd/MM/yyyy")}
                        </span>
                      )}
                      {Object.keys(fact.attributes).length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {Object.keys(fact.attributes).length} attributes
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
                {invalidFacts.map((fact) => (
                  <div
                    key={fact.uuid}
                    className="bg-grayAlpha-100 rounded-md p-3"
                  >
                    <p className="mb-1 text-sm">{fact.fact}</p>
                    <div className="text-muted-foreground flex items-center gap-2 text-xs">
                      {fact.invalidAt && (
                        <span>
                          Invalid: {new Date(fact.invalidAt).toLocaleString()}
                        </span>
                      )}
                      {Object.keys(fact.attributes).length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {Object.keys(fact.attributes).length} attributes
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground p-4 text-center text-sm">
                No facts found for this episode
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
