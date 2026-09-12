import { z } from 'zod';
import { ToolDefinition } from '../../../mcp/types.js';

export const slackSearchGuideTool: ToolDefinition = {
  name: 'slack-search-guide',
  description:
    'Provides search operators, query syntax, best practices, and multi-step sequential search playbooks for AI agents searching Slack conversations, channels, direct messages, and files.',
  schema: {
    topic: z
      .enum(['operators', 'playbooks', 'sequential_strategies', 'topic_summaries', 'troubleshooting', 'all'])
      .optional()
      .default('all')
      .describe(
        'Topic to retrieve: "operators" for query syntax, "playbooks" for step-by-step investigation flows, "sequential_strategies" for multi-query refinement, "topic_summaries" for 3-step context & file pipeline, "troubleshooting" for handling 0 results, or "all" for the complete guide.'
      ),
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  execute: async (args: {
    topic?: 'operators' | 'playbooks' | 'sequential_strategies' | 'topic_summaries' | 'troubleshooting' | 'all';
  }) => {
    const topic = args.topic || 'all';

    const operatorsSection = `
### 1. Slack Query Operators & Syntax Reference

| Operator | Syntax Example | Description |
| :--- | :--- | :--- |
| **From Author** | \`from:@username\` | Messages sent by a specific user (e.g. \`from:@alex\`). |
| **To Person / DM** | \`to:@username\` | Messages sent directly to someone or mentioning them. |
| **In Channel** | \`in:#channel-name\` | Restricts search to a specific public or private channel (e.g. \`in:#engineering\`). |
| **Direct Message** | \`in:@username\` | Searches direct messages exchanged with a specific person. |
| **With Person** | \`with:@username\` | Searches any conversation (channel, group, or DM) that includes this person. |
| **After Date** | \`after:YYYY-MM-DD\` | Messages sent after the specified date (e.g. \`after:2024-06-01\`). |
| **Before Date** | \`before:YYYY-MM-DD\` | Messages sent before the specified date (e.g. \`before:2024-12-31\`). |
| **On Date** | \`on:YYYY-MM-DD\` | Messages sent on a specific calendar date. |
| **During Month/Year** | \`during:july-2024\` | Messages sent during a specific month or year. |
| **Has Web Link** | \`has:link\` | Filters messages containing URLs or hyperlinks. |
| **Has Attachment** | \`has:file\` | Filters messages with attached documents, PDFs, or files. |
| **Has Reaction** | \`has:reaction\` | Messages that have emoji reactions. |
| **Has Pin** | \`has:pin\` | Messages pinned in channels. |
| **Exact Phrase** | \`"quarterly review"\` | Encloses words in double quotes for verbatim phrase matching. |
| **OR Logic** | \`budget OR forecast\` | Retrieves messages matching either term (must be capital OR). |
| **Exclusion / NOT** | \`-noise\` or \`NOT bot\` | Excludes messages containing the specified keyword. |
`;

    const topicSummariesSection = `
### 2. Multi-Step Topic Summary & Context Expansion Pipeline (AI Best Practice)

When an employee asks you for a **summary** or **deep investigation** of a topic (e.g. *"Summarize the discussions about the billing migration"*), execute the official **3-Step Context Expansion Pattern**:

\`\`\`
[Step 1: Discover Anchors] ──► [Step 2: Expand Conversations] ──► [Step 3: Read Referenced Files] ──► [Step 4: Synthesize]
\`\`\`

1. **Step 1: Discover Anchor Messages (\`slack-federated-search\`)**:
   - Run a search query for the topic keywords.
   - Note the returned items:
     - \`channelId\`: Channel ID (e.g. \`C01234567\`)
     - \`messageTs\`: Message timestamp (e.g. \`1704220740.012345\`)
     - \`threadTs\`: Parent thread timestamp (if message is in a thread)
     - \`replyCount\`: Number of thread replies
     - \`files\`: Array of attached file descriptors (\`id\`, \`name\`, \`filetype\`)

2. **Step 2: Expand Surrounding Context or Threads**:
   - **Scenario A (Thread Discussion)**: If \`replyCount > 0\` or \`threadTs\` is present:
     - Call **\`slack-get-thread-replies\`** with \`channelId\` and \`threadTs\`.
     - This fetches the entire discussion chain up to 50 replies in chronological order.
   - **Scenario B (Channel Timeline)**: If the message is in the main channel stream:
     - Call **\`slack-get-channel-context\`** with \`channelId\` and \`messageTs\`.
     - This fetches the preceding and succeeding messages around the key event to see how the discussion unfolded.

3. **Step 3: Inspect Attached Documents & Code (\`slack-get-file-content\`)**:
   - If search results or message threads contain \`files\` with relevant names (e.g. \`migration_plan.md\`, \`error_log.csv\`, \`spec.json\`):
     - Call **\`slack-get-file-content\`** with \`fileId\`.
     - Reads and sanitizes the file text up to 15,000 characters.

4. **Step 4: Formulate the Synthesized Summary**:
   - Structure your response into clear sections:
     - **Topic Overview & Status**: Executive summary of what was decided or discussed.
     - **Key Decisions & Contributors**: Who agreed to what, citing usernames (@name) and channels (#channel).
     - **Chronological Timeline**: Milestones or timestamps from the expanded conversation.
     - **Referenced Artifacts**: Summaries of attached documents with permalinks for user verification.
`;

    const sequentialStrategiesSection = `
### 3. Multi-Step Sequential Search Strategies for AI Agents

For complex queries, **never rely on a single static search**. Execute sequential queries to iteratively uncover context:

\`\`\`
[Step 1: Broad Discovery] ──► [Step 2: Inspect Channels & Authors] ──► [Step 3: Narrow with Operators] ──► [Step 4: Retrieve Decisions & Links]
\`\`\`

#### Strategy A: Topic & Project Investigation (Broad-to-Narrow)
1. **Pass 1 (Broadcast Scan)**: Run broad keyword search across all channels to identify where activity is happening:
   - \`query: "Project Titan launch"\` (sort: "score")
2. **Pass 2 (Context Extraction)**: Inspect returned channel names and key contributors from Pass 1 (e.g. \`#titan-core\`, \`@marcus\`).
3. **Pass 3 (Refined Channel Focus)**: Drill down into the specific channel with temporal filters:
   - \`query: "in:#titan-core from:@marcus architecture after:2024-05-01"\` (sort: "timestamp")
4. **Pass 4 (Artifact Retrieval)**: Search specifically for shared documents or meeting summaries:
   - \`query: "in:#titan-core has:link specification"\`

#### Strategy B: Person & Ownership Tracing
1. **Pass 1 (Direct Mentions & Discussions)**: Locate conversations involving key stakeholders:
   - \`query: "with:@sarah quarterly budget review"\`
2. **Pass 2 (Approval Verification)**: Search for finalized sign-offs:
   - \`query: "from:@sarah \\"approved\\" in:#finance-approvals"\`

#### Strategy C: Chronological Event Reconstruction
1. **Pass 1 (Anchor Event Identification)**: Find the announcement or kickoff message:
   - \`query: "Titan kickoff announcement"\` (note timestamp: e.g. 2024-03-15)
2. **Pass 2 (Surrounding Context Windows)**: Search within a narrow time window around the anchor:
   - \`query: "in:#titan-core after:2024-03-14 before:2024-03-20"\`
`;

    const troubleshootingSection = `
### 4. Zero-Results Troubleshooting & Query Recovery

If a search returns 0 results, **do not assume the information does not exist**. Apply these query recovery tactics in sequence:

1. **Relax Exact Quotes**: Replace verbatim quotes \`"quarterly budget review"\` with individual tokens \`quarterly budget review\`.
2. **Remove Channel Restrictions**: If \`in:#proj-titan\` returns zero, remove \`in:#proj-titan\`—discussions often take place in general, random, or DM threads.
3. **Widen or Remove Time Bounds**: Dates in user memory are frequently off by weeks or months. Remove \`after:\` / \`before:\` operators.
4. **Try Acronyms & Synonyms**: Search for common abbreviations (e.g. \`QBR\` vs \`quarterly business review\`, \`PRD\` vs \`product requirement doc\`).
5. **Search by Author Alone**: Search \`from:@username\` with fewer keyword restrictions to inspect recent topics they participated in.
`;

    const synthesisGuidelinesSection = `
### 5. Agent Synthesis & Response Guidelines

When presenting Slack search results to users:
- **Cite Context**: Always mention the channel name (e.g. \`#proj-billing\`) or conversation type (Direct Message).
- **Include Permalinks**: Provide clickable permalinks for each message so users can verify in Slack with 1 click.
- **Timestamp Awareness**: Note when the message was sent (e.g. *"On August 12, 2024, @sarah confirmed..."*).
- **Acknowledge User ACLs**: Inform the user if results are drawn from their personal direct messages versus public channels.
`;

    let content = '# Slack Federated Search Playbook & Discovery Guide\n\n';

    if (topic === 'operators') {
      content += operatorsSection;
    } else if (topic === 'topic_summaries') {
      content += topicSummariesSection;
    } else if (topic === 'sequential_strategies' || topic === 'playbooks') {
      content += sequentialStrategiesSection;
    } else if (topic === 'troubleshooting') {
      content += troubleshootingSection;
    } else {
      content +=
        operatorsSection +
        topicSummariesSection +
        sequentialStrategiesSection +
        troubleshootingSection +
        synthesisGuidelinesSection;
    }

    return {
      status: 'success',
      topic,
      guide: content,
    };
  },
};
