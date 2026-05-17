# Generated Runtime Art

This directory records project-generated visual assets used by the MVP runtime.

- Generator: OpenAI image generation through Codex built-in image generation.
- Generated date: 2026-05-15.
- Prompt/source records: each subdirectory keeps its own `PROMPT.md` and source sheet under `source/`.
- Third-party source images: none intentionally used in the generated prompts.

Runtime cutouts are exported under `client/assets/resources/art/`. Source sheets in this directory are audit records and should not be copied into the WeChat first package. Only explicitly selected runtime cutouts required by Cocos resources or the native fallback should enter runtime builds.

Usage note: treat these as project-generated playtest/runtime assets, keep the prompt and source records with any derivative files, and review the applicable image generation service terms before external release.
