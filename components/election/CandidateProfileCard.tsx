"use client";

import { useState } from "react";

import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react";

import { truncateText } from "@/lib/text-utils";
import type { CandidateProfile } from "@/types/eas";

const STATEMENT_PREVIEW_LENGTH = 120;

interface CandidateProfileCardProps {
  profile: CandidateProfile;
}

export function CandidateProfileCard({
  profile,
}: CandidateProfileCardProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);

  const hasStatement = profile.statement.length > 0;
  const isLong = profile.statement.length > STATEMENT_PREVIEW_LENGTH;

  return (
    <div className="space-y-1 px-1">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{profile.name}</span>
        {profile.discourseHandle && (
          <a
            href={`https://forum.arbitrum.foundation/u/${profile.discourseHandle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors"
            title={`Discourse: ${profile.discourseHandle}`}
          >
            <MessageSquare className="h-3 w-3" />
          </a>
        )}
        {profile.twitterHandle && (
          <a
            href={`https://x.com/${profile.twitterHandle}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors"
            title={`@${profile.twitterHandle}`}
          >
            <svg
              className="h-3 w-3"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
        )}
      </div>

      {hasStatement && (
        <div className="text-xs text-muted-foreground">
          {expanded || !isLong ? (
            <p className="whitespace-pre-wrap">{profile.statement}</p>
          ) : (
            <p>{truncateText(profile.statement, STATEMENT_PREVIEW_LENGTH)}</p>
          )}
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-primary/70 hover:text-primary text-xs mt-0.5 flex items-center gap-0.5"
            >
              {expanded ? (
                <>
                  Less <ChevronUp className="h-3 w-3" />
                </>
              ) : (
                <>
                  More <ChevronDown className="h-3 w-3" />
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
