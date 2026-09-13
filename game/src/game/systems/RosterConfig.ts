import heroRoster from '../config/heroRoster.json';
import ropMapping from '../config/ropMapping.json';
import { HeroSlug } from '../core/Constants';

export interface HeroDef {
    slug: HeroSlug;
    sprite: string;
    color: string;
    flying: boolean;
}

const heroes = heroRoster.heroes as HeroDef[];
const mapping = ropMapping.mapping as Record<string, HeroSlug>;

const reverseMapping: Partial<Record<HeroSlug, string>> = {};
for (const [ropName, slug] of Object.entries(mapping)) {
    reverseMapping[slug] = ropName;
}

export const RosterConfig = {
    heroes,

    /** Returns the hero slug for a real ROP name, or null if unmapped (overflow bucket). */
    heroSlugForRop(ropName: string): HeroSlug | null {
        return mapping[ropName] ?? null;
    },

    /** Reverse lookup for display purposes (e.g. the leaderboard) — no human-readable names exist yet, so this is the recognizable "СР1" etc. */
    ropNameForSlug(slug: HeroSlug): string | undefined {
        return reverseMapping[slug];
    },

    heroDef(slug: HeroSlug): HeroDef | undefined {
        return heroes.find(h => h.slug === slug);
    },
};
