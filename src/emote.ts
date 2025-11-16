export interface Emote {
    code: string;
    id: string;
    url: {
        low: string;
        mid?: string;
        high?: string;
    }
}

interface APIResponse {
    emotes: Emote[];
}

export class EmoteFetcher {
    private static readonly baseURL: string = "https://open.staroverlay.com/twitch/";

    private readonly emotes: Set<Emote>;
    private readonly emotesMap: Map<string, Emote>;

    constructor() {
        this.emotes = new Set();
        this.emotesMap = new Map();
    }

    async fetchEmotes(username: string) {
        const req = await fetch(EmoteFetcher.baseURL + "emotes?providers=7tv,bttv,ffz&username=" + username);
        const { emotes } = await req.json() as APIResponse;

        for (const emote of emotes) {
            this.emotes.add(emote);
            this.emotesMap.set(emote.code, emote);
        }
    }

    getEmotes() {
        return this.emotes;
    }

    getEmote(code: string) {
        return this.emotesMap.get(code);
    }

    extractEmotes(message: string) {
        const detected = [];

        const parts = message.split(" ");
        for (const part of parts) {
            const emoteCandidate = this.getEmote(part);
            if (emoteCandidate) detected.push(emoteCandidate);
        }

        return detected;
    }
}