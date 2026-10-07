# AI usage

This project is deliberately built to use AI agents as much as possible as an experiment. **All code and documentation in this repository is written by AI agents unless it is marked as written by hand.**

AI is involved at two levels:

- **Building the project.** AI coding agents write the extension, the monitoring pipeline, the tests and the docs, including this file and the README.
- **Running the project.** A vision model reviews screenshots, and a repair agent proposes selector fixes when YouTube's layout changes.

The human maintainer sets direction and decides what to keep. How changes reach the code depends on the agent:

- **The repair agent** can only propose changes. It opens a pull request, and the maintainer merges it, updates it or closes it.
- **AI coding agents used to build the project**, such as Claude Code, run on the maintainer's machine with the maintainer's Git and GitHub access. They can commit and push to the main branch directly, without a pull request, and in this project they usually do, at the maintainer's request. Nothing requires a review before they push: `main` has no branch protection.
