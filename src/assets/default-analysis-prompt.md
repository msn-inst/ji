# Analysis Prompt

Analyze the following JIRA issue and comments. Identify the root cause and propose a solution approach.

## Code Context

**IMPORTANT**: For best results, run this analysis from the code directory/repository related to the JIRA issue.
The AI tool will analyze the issue in the context of your current working directory.
If you're not in the relevant codebase, the analysis may be less accurate.

## Required Analysis

**CRITICAL REQUIREMENT**: Your response MUST begin with the robot header to indicate this is an automated analysis.

**MANDATORY FORMAT**: Begin your response with exactly:
:robot: [Tool Name] ([Model Name])

**CORRECT EXAMPLES**:
:robot: Claude Code (Sonnet 4)
:robot: Gemini CLI (1.5 Pro) 
:robot: ChatGPT Plus (GPT-4)

**WRONG FORMAT** (do not use):
:robot: [Claude Code (Sonnet 4)]
:robot: [Gemini (1.5 Pro)]

**DO NOT** use the emoji 🤖 - use the text :robot: which will be converted automatically.

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

**CRITICAL**: Output your response in an opening <ji-response> and closing </ji-response> tag. The contents inside the tags MUST start with :robot: [Tool Name] ([Model Name]) as shown in the examples above.

## Example Format

<ji-response>
:robot: Claude Code (Sonnet 4)

h4. Summary
The line spacing inconsistency arises because the Comment Library uses a standard `<textarea>` element, while the main comment field is a TinyMCE rich text editor. Newlines in a `<textarea>` are rendered differently than the `<p>` tags used by TinyMCE for paragraphs, causing a visual mismatch in the line-height during comment composition.

h4. Affected components
* SpeedGrader
* Comment Library

h4. Key files
* `app/views/shared/media_comment_form.html.erb`: This file contains the main media comment form, including the TinyMCE editor instance used for submission comments in SpeedGrader.
* `ui/src/apps/speedgrader/CommentLibrary/CommentLibraryForm.tsx`: This React component renders the form for adding or editing a comment within the Comment Library, which includes the `<textarea>` element with the inconsistent spacing.
* `ui/src/apps/speedgrader/CommentLibrary/CommentLibraryManager.tsx`: The parent component that manages the state and functionality of the Comment Library, including rendering the `CommentLibraryForm`.

h4. Proposal
* Replace the `<textarea>` in CommentLibraryForm with a TinyMCE instance to maintain consistency
* Alternatively, standardize line-height CSS properties between both editors
* Update CommentLibraryManager to handle rich text content from the Comment Library

h4. Next steps
* Examine the TinyMCE configuration in media_comment_form.html.erb
* Update CommentLibraryForm.tsx to use TinyMCE or match its styling
* Test comment rendering consistency between both interfaces
</ji-response>
