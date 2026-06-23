# Agent Behavior and Rules for Pathifier

## Git Commit Workflow
*   **Prompt for Git Commit:** At the end of every successful task/prompt completion, the agent MUST explicitly ask the user if they would like to commit the changes to Git.
*   **Prompt details:** Suggest a default, descriptive commit message based on the work done in the task, and offer to execute the commit directly if approved.
*   **Numbered Options & Interactive Modal:** Always present the prompt with numbered options. To allow the user to execute the choice without typing or pressing enter, the agent MUST invoke the `ask_question` tool, presenting the numbered choices as a selectable list. E.g.:
    1. Yes, commit with the suggested message.
    2. Yes, commit with a custom message (prompt me for it).
    3. No, do not commit.
