# Questions for Luke

To send to `lukemiha@gmail.com`, subject `TEST PROJECT_JOHN MAHESWARAN`.

## Blocking — needed before the MarioBot step can be built

1. **What is the exact request shape for the Mario-Bot slug?** I have the OpenRouter key and the instruction to "use Mario-Bot slug", but not the base URL, the model/slug string as it should appear in the request, or whether it's OpenAI-chat-compatible. A single working `curl` would unblock this immediately.
2. **What does the Genesis API key authenticate?** Is it a separate Genesis-hosted endpoint that fronts MarioBot, or an alternative path to the same bot? Which of the two keys should the prototype actually use?
3. **Does MarioBot already hold product/brand context server-side?** Part 2 of the Loom says "within our system, it'll already have access to information of the product". If that context lives with the bot, the prototype only sends the hook. If not, I need to send product context too, and I'd need that copy.

## Important — changes what gets built

4. **Which Instagram account?** Do you supply a burner already primed for the testosterone market, or should I create and prime one? Strong recommendation: never the client's real business account. Priming a fresh account well enough to produce a relevant feed takes a few days of passive use.
5. **Which engagement metric do you actually trust for the outlier call?** The Loom uses view counts on reels. Feed images often expose only likes, and some accounts hide counts entirely. Confirm that "use the best available and label which one" is the right behaviour rather than skipping posts we can't score cleanly.
6. **Is the writing instruction set fixed or editable?** You mentioned providing writing instructions. Should the prototype ship one canonical prompt, or let the strategist edit it before sending — the Loom shows you rephrasing as you go.

## Nice to have

7. Access to the Notion walkthrough — the link in the brief needs a workspace invite.
8. Anything in the current Google Doc swipe file you'd want the export format to match.

## One flag back to you

The OpenRouter and Genesis keys were sent in the plain-text job post, so they're now in the inbox of everyone who applied. Worth rotating them once the test projects are in, whoever you end up hiring. They are kept in `.env` here and are not committed to this repository.
