import type { Emote, EmoteFetcher } from "./emote";

export type MessageTokenEmote = {
    type: "emote";
    emote: Emote;
}

export type MessageTokenText = {
    type: "text";
    text: string;
}

export type MessageToken = MessageTokenEmote | MessageTokenText;

export type TwitchMessageRawEmotes = { [emoteid: string]: string[] } | undefined;

export function parseTwitchMessage(message: string, messageEmotes: TwitchMessageRawEmotes, emoteFetcher: EmoteFetcher): MessageToken[] {
    const ranges: { start: number, end: number, emoteId: string }[] = [];

    for (const [emoteId, arr] of Object.entries(messageEmotes || {})) {
        for (const range of arr) {
            const [start, end] = range.split("-").map(Number);
            ranges.push({ start, end, emoteId });
        }
    }

    ranges.sort((a, b) => a.start - b.start);

    const tokens: MessageToken[] = [];
    let cursor = 0;

    for (const r of ranges) {
        if (r.start > cursor) {
            const textChunk = message.substring(cursor, r.start);
            tokens.push(...parseTextChunk(textChunk, emoteFetcher));
        }

        const code = message.substring(r.start, r.end + 1);
        const emote = parseTwitchEmote(code, r.emoteId);
        tokens.push({ type: "emote", emote });
        cursor = r.end + 1;
    }

    if (cursor < message.length) {
        const textChunk = message.substring(cursor);
        tokens.push(...parseTextChunk(textChunk, emoteFetcher));
    }

    return tokens;
}

function parseTwitchEmote(code: string, id: string): Emote {
    const url = "https://static-cdn.jtvnw.net/emoticons/v2/" + id + "/default/dark/";

    return {
        code,
        id,
        url: {
            low: url + "/1.0",
            mid: url + "/2.0",
            high: url + "/3.0",
        }
    };
}

function parseTextChunk(textChunk: string, emoteFetcher: EmoteFetcher) {
    const tokens: MessageToken[] = [];
    const words = textChunk.split(/(\s+)/);

    for (const part of words) {
        if (part.trim() == "") {
            tokens.push({ type: "text", text: part });
            continue;
        }

        const emote = emoteFetcher.getEmote(part);
        if (emote) {
            tokens.push({
                type: "emote",
                emote
            })
        } else {
            tokens.push({
                type: "text",
                text: part
            })
        }
    }

    return tokens;
}