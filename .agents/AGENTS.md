# Agent Behavior and Rules for Pathifier

## Git Commit Workflow
*   **Prompt for Git Commit:** At the end of every successful task/prompt completion, the agent MUST explicitly ask the user if they would like to commit the changes to Git.
*   **Prompt details:** Suggest a default, descriptive commit message based on the work done in the task, and offer to execute the commit directly if approved.
*   **Numbered Options:** Always present the prompt with numbered options so the user can reply with a single digit to make a quick choice. E.g.:
    1. Yes, commit with the suggested message.
    2. Yes, commit with a custom message (prompt me for it).
    3. No, do not commit.
