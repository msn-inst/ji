# Analysis Prompt

Analyze the following JIRA issue and comments. Identify the root cause and propose a solution approach.

## Code Context

**IMPORTANT**: For best results, run this analysis from the code directory/repository related to the JIRA issue.
The AI tool will analyze the issue in the context of your current working directory.
If you're not in the relevant codebase, the analysis may be less accurate.

## Required Analysis

Begin your response with
🤖 LLM Tool (Model)
to indicate this is an automated analysis.
e.g.
🤖 Claude Code (Sonnet 4)
or
🤖 Gemini (Gemini 2.5 Flash)

When it is wrong, disagree with previous analysis.

It is more important to be correct than to agree with previous analysis.

Provide the following sections using plain text formatting:
- Summary: State the core issue in 1-2 sentences. Note agreement or disagreement with previous analysis.
- Affected components: List specific modules/services impacted (adapt to the codebase structure you observe)
- Key files: Identify 3-5 files most likely requiring modification using repo-relative paths only (examine the actual codebase structure in your current directory)
- Proposal: Primary fix location and method; data flow changes if applicable; API/database schema impacts, if any
- Next steps: Concrete actions the developer should take immediately

If possible, answer any unanswered questions asked in Jira issue comments.

## Constraints

- Mention relevant specs that need updating
- Don't mention general location of fix. Opt instead for specifics. Don't say, "No [X] changes required."

Use bullet points. No introductions or conclusions. Be concise. Avoid fluff. Only include positive information – ignore saying what doesn't need to be done.

## Structure

h4. Summary
[1-2 sentence description]

h4. Affected components
* [component 1]
* [component 2]
* [component 3]

h4. Key files
* {{path/to/file1.ext}}: [description]
* {{path/to/file2.ext}}: [description]
* {{path/to/file3.ext}}: [description]

h4. Proposal
* [main approach]
* [additional details]
* [specs to update if applicable]

h4. Next steps
* [immediate action 1]
* [immediate action 2]

Output your response in a <response></response> tag. Remember, the contents of this response (inside the <response></response> tags) should start with :robot: with named tool.

## Example

<response>
:robot: Gemini (Gemini 2.5 Flash)
[the body of the response]
</response>
