// Types for the v1 agent request contract (contracts/agent-tools.schema.json).

export type AgentTool =
  'briefs.list' | 'items.read' | 'drafts.propose' | 'drafts.revise' | 'social.propose' | 'jobs.read';

export interface DraftFields {
  title: string;
  summary?: string;
  bodyMarkdown: string;
  section?: string;
  sourceIds: string[];
  editorNotes?: string;
}

interface Base {
  schemaVersion: '1.0';
  requestId: string;
  idempotencyKey?: string;
}

export type AgentRequest = Base &
  (
    | { tool: 'briefs.list'; arguments: { cursor?: string; limit?: number } }
    | { tool: 'items.read'; arguments: { itemId: string } }
    | { tool: 'drafts.propose'; idempotencyKey: string; arguments: { briefId: string; content: DraftFields } }
    | {
        tool: 'drafts.revise';
        idempotencyKey: string;
        arguments: { draftId: string; expectedRevision: string; content: DraftFields };
      }
    | {
        tool: 'social.propose';
        idempotencyKey: string;
        arguments: {
          itemId: string;
          reviewSnapshotId: string;
          channelConnectionId: string;
          text: string;
          assetIds?: string[];
          suggestedLocalTime?: string;
          timeZone?: string;
        };
      }
    | { tool: 'jobs.read'; arguments: { jobId: string } }
  );

export interface ContractError {
  path: string;
  keyword: string;
  message: string;
}

export declare const agentRequestSchema: Record<string, unknown>;
export declare const AGENT_TOOLS: readonly AgentTool[];
export declare const WRITE_TOOLS: readonly AgentTool[];
export declare function validateAgentRequest(
  body: unknown,
): { ok: true; request: AgentRequest } | { ok: false; errors: ContractError[] };
