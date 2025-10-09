import { Calendar } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import type { StatementNode } from "@core/types";
import { cn } from "~/lib/utils";
import { useNavigate } from "@remix-run/react";
import Markdown from "react-markdown";
import { StyledMarkdown } from "../common/styled-markdown";

export interface Episode {
  uuid: string;
  content: string;
  originalContent: string;
  source: any;
  createdAt: Date;
  validAt: Date;
  metadata: any;
  sessionId: any;
  logId?: any;
}

interface SpaceFactCardProps {
  episode: Episode;
}

export function SpaceEpisodeCard({ episode }: SpaceFactCardProps) {
  const navigate = useNavigate();
  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const displayText = episode.originalContent;

  const onClick = () => {
    navigate(`/home/inbox/${episode.logId}`);
  };

  return (
    <>
      <div className="group flex w-full items-center px-5 pr-2">
        <div
          className={cn(
            "group-hover:bg-grayAlpha-100 flex min-w-[0px] shrink grow cursor-pointer items-start gap-2 rounded-md px-3",
          )}
          onClick={onClick}
        >
          <div
            className={cn(
              "border-border flex w-full min-w-[0px] shrink flex-col border-b py-1",
            )}
          >
            <div className="flex w-full items-center justify-between gap-4">
              <div className="inline-flex min-h-[24px] min-w-[0px] shrink items-center justify-start">
                <StyledMarkdown>{displayText.slice(0, 300)}</StyledMarkdown>
              </div>
              <div className="text-muted-foreground flex shrink-0 items-center justify-end gap-2 text-xs">
                <Badge variant="secondary" className="rounded text-xs">
                  <Calendar className="h-3 w-3" />
                  {formatDate(episode.validAt)}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
