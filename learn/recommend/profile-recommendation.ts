import _ from 'lodash';
import Axios from 'axios';

import { CharacterAnalysis, Matcher } from '../matcher';
import {
  FurryPreference,
  Kink,
  mammalSpecies,
  Species
} from '../matcher-types';
import { characterImage } from '../../chat/common';
import { ProfileCache } from '../profile-cache';

export enum ProfileRecommendationLevel {
  INFO = 'info',
  NOTE = 'note',
  CRITICAL = 'critical'
}

export interface ProfileRecommendationUrlParams {
  // TBD
}

export interface ProfileRecommendation {
  code: string;
  level: ProfileRecommendationLevel;
  title: string;
  desc: string;
  helpUrl?: string;
  urlParams?: ProfileRecommendationUrlParams;
}

export class ProfileRecommendationAnalyzer {
  protected recommendations: ProfileRecommendation[] = [];

  constructor(protected readonly profile: CharacterAnalysis) {
    //
  }

  protected add(
    code: string,
    level: ProfileRecommendationLevel,
    title: string,
    desc: string,
    helpUrl?: string,
    urlParams?: ProfileRecommendationUrlParams
  ): void {
    this.recommendations.push({ code, level, title, desc, helpUrl, urlParams });
  }

  async analyze(): Promise<ProfileRecommendation[]> {
    this.recommendations = [];

    await this.checkPortrait();
    await this.checkHqPortrait();

    this.checkMissingProperties();
    this.checkSpeciesPreferences();
    this.checkKinkCounts();
    this.checkCustomKinks();

    this.checkImages();
    this.checkInlineImage();
    this.checkDescriptionLength();

    return this.recommendations;
  }

  protected async checkPortrait(): Promise<void> {
    const portraitUrl = characterImage(this.profile.character.name);

    const result = await Axios.head(portraitUrl);

    if (
      _.trim(result.headers['etag'] || '', '"')
        .trim()
        .toLowerCase() === '639d154d-16c3'
    ) {
      this.add(
        `ADD_AVATAR`,
        ProfileRecommendationLevel.CRITICAL,
        'Add an avatar portrait',
        'Profiles with an avatar portrait stand out in chats.',
        'https://wiki.f-list.net/Guide:_Character_Profiles#Avatar'
      );
    }
  }

  protected async checkHqPortrait(): Promise<void> {
    const profileUrl = ProfileCache.extractHighQualityPortraitURL(
      this.profile.character.description
    );

    if (!profileUrl) {
      this.add(
        `ADD_HQ_AVATAR`,
        ProfileRecommendationLevel.CRITICAL,
        'Add a high-quality portrait',
        'Profiles with a high-quality portraits stand out in chats with other Horizon users.',
        'https://horizn.moe/docs/guides/colors-and-avatars.html'
      );
    } else if (!ProfileCache.isSafeRisingPortraitURL(profileUrl)) {
      this.add(
        `ADD_HQ_AVATAR_SAFE_DOMAIN`,
        ProfileRecommendationLevel.CRITICAL,
        'Unsupported high-quality portrait URL',
        'High-quality portraits can only point to f-list.net, freeimages.host, e621.net, iili.io, imgur.com, imgchest.com, or redgifs.com domains.',
        'https://horizn.moe/docs/guides/colors-and-avatars.html'
      );
    }
  }

  protected checkImages(): void {
    if (!this.profile.character.image_count) {
      this.add(
        `ADD_IMAGE`,
        ProfileRecommendationLevel.CRITICAL,
        'Add a profile image',
        'Profiles with images are more attractive to other players.',
        'https://wiki.f-list.net/Guide:_Character_Profiles#Images'
      );
    } else if (
      this.profile.character.image_count > 1 &&
      this.profile.character.image_count < 3
    ) {
      this.add(
        `ADD_MORE_IMAGES`,
        ProfileRecommendationLevel.NOTE,
        'Add more profile images',
        'Profiles with images are more attractive – try to have at least 3 images in your profile.',
        'https://wiki.f-list.net/Guide:_Character_Profiles#Images'
      );
    }
  }

  protected checkInlineImage(): void {
    if (_.keys(this.profile.character.inlines).length < 1) {
      this.add(
        `ADD_INLINE_IMAGE`,
        ProfileRecommendationLevel.NOTE,
        'Add an inline image',
        'Profiles with inline images are more engaging to other players.',
        'https://wiki.f-list.net/Frequently_Asked_Questions#How_do_I_add_an_inline_image_to_my_profile.3F'
      );
    }
  }

  protected checkDescriptionLength(): void {
    const desc = this.profile.character.description.trim();

    if (desc.length < 20) {
      this.add(
        `ADD_DESCRIPTION`,
        ProfileRecommendationLevel.CRITICAL,
        'Add a description',
        'Profiles with descriptions are more likely to draw attention from other players.',
        'https://wiki.f-list.net/Guide:_Character_Profiles#Description'
      );
    } else if (desc.length < 400) {
      this.add(
        `EXPAND_DESCRIPTION`,
        ProfileRecommendationLevel.NOTE,
        'Extend your description',
        'Long descriptions are more attractive to other players. Try expanding your description to at least 400 characters.',
        'https://wiki.f-list.net/Guide:_Character_Profiles#Description'
      );
    }
  }

  protected checkCustomKinks(): void {
    const counts = _.reduce(
      this.profile.character.customs,
      (accum, kink) => {
        if (kink) {
          accum.total += 1;

          if (kink.description) {
            accum.filled += 1;
          }
        }

        return accum;
      },
      { filled: 0, total: 0 }
    );

    if (counts.total === 0) {
      this.add(
        `ADD_CUSTOM_KINK`,
        ProfileRecommendationLevel.CRITICAL,
        'Add custom kinks',
        `Custom kinks will help your profile stand out. Try adding at least 5 custom kinks.`,
        'https://wiki.f-list.net/Guide:_Character_Profiles#Custom_Kinks'
      );
    } else if (counts.total < 5) {
      this.add(
        `ADD_MORE_CUSTOM_KINKS`,
        ProfileRecommendationLevel.NOTE,
        'Add more custom kinks',
        `Players pay a lot of attention to custom kinks. Try adding at least 5 custom kinks.`,
        'https://wiki.f-list.net/Guide:_Character_Profiles#Custom_Kinks'
      );
    }

    if (counts.filled < counts.total && counts.total > 0) {
      this.add(
        `ADD_MORE_CUSTOM_KINK_DESCRIPTIONS`,
        ProfileRecommendationLevel.NOTE,
        'Add descriptions to custom kinks',
        `Some or all of your custom kinks are missing descriptions. Add descriptions to your custom kinks to attract more players.`,
        'https://wiki.f-list.net/Guide:_Character_Profiles#Custom_Kinks'
      );
    }
  }

  protected checkKinkCounts(): void {
    const kinks = Matcher.getAllStandardKinks(this.profile.character);

    const counts = _.reduce(
      kinks,
      (accum, kinkLevel) => {
        if (_.isString(kinkLevel) && kinkLevel) {
          accum[kinkLevel as keyof typeof accum] += 1;
        }

        return accum;
      },
      { favorite: 0, yes: 0, maybe: 0, no: 0 }
    );

    const minCountPerType = 5;
    const totalCount = counts.favorite + counts.yes + counts.maybe + counts.no;

    if (totalCount < 10) {
      this.add(
        `ADD_MORE_KINKS`,
        ProfileRecommendationLevel.CRITICAL,
        `Add more kinks`,
        `You should have at least 10 kinks for the matching algorithm to work well.`,
        'https://wiki.f-list.net/Guide:_Character_Profiles#Kinks'
      );
    } else {
      _.each(counts, (count, key) => {
        if (count < minCountPerType) {
          this.add(
            `ADD_MORE_KINKS_${key.toString().toUpperCase()}`,
            ProfileRecommendationLevel.CRITICAL,
            `Add more '${key}' kinks`,
            `You should have at least ${minCountPerType} '${key}' kinks for the matching algorithm to work well.`,
            'https://wiki.f-list.net/Guide:_Character_Profiles#Kinks'
          );
        }
      });
    }
  }

  protected checkMissingProperties(): void {
    const p = this.profile;

    if (p.age === null) {
      this.add(
        'AGE',
        ProfileRecommendationLevel.CRITICAL,
        'Enter age',
        'Specifying the age of your character will improve your matches with other players.',
        'https://wiki.f-list.net/Guide:_Character_Profiles#General_Details'
      );
    }

    if (p.orientation === null) {
      this.add(
        'ORIENTATION',
        ProfileRecommendationLevel.CRITICAL,
        'Enter sexual orientation',
        'Specifying the sexual orientation of your character will improve your matches with other players.',
        'https://wiki.f-list.net/Guide:_Character_Profiles#General_Details'
      );
    }

    if (p.species === null) {
      this.add(
        'SPECIES',
        ProfileRecommendationLevel.CRITICAL,
        'Enter species',
        "Specifying the species of your character – even if it's 'human' – will improve your matches with other players.",
        'https://wiki.f-list.net/Guide:_Character_Profiles#General_Details'
      );
    }

    if (p.furryPreference === null) {
      this.add(
        'FURRY_PREFERENCE',
        ProfileRecommendationLevel.CRITICAL,
        'Enter furry preference',
        'Specifying whether you like to play with anthro characters will improve your matches with other players.',
        'https://wiki.f-list.net/Guide:_Character_Profiles#RPing_Preferences'
      );
    }

    if (p.subDomRole === null) {
      this.add(
        'SUB_DOM_ROLE',
        ProfileRecommendationLevel.CRITICAL,
        'Enter sub/dom role',
        'Specifying your preferred sub/dom role will improve your matches with other players.',
        'https://wiki.f-list.net/Guide:_Character_Profiles#Sexual_Details'
      );
    }

    if (p.position === null) {
      this.add(
        'POSITION',
        ProfileRecommendationLevel.CRITICAL,
        'Enter position',
        'Specifying your preferred position (e.g. "top", "bottom") will improve your matches with other players.',
        'https://wiki.f-list.net/Guide:_Character_Profiles#Sexual_Details'
      );
    }

    if (p.postLengthPreference === null) {
      this.add(
        'POST_LENGTH',
        ProfileRecommendationLevel.CRITICAL,
        'Enter post length preference',
        'Specifying your post length preference will improve your matches with other players.',
        'https://wiki.f-list.net/Guide:_Character_Profiles#RPing_Preferences'
      );
    }

    if (p.bodyType === null) {
      this.add(
        'BODY_TYPE',
        ProfileRecommendationLevel.CRITICAL,
        'Enter body type',
        "Specifying your character's body type will improve your matches with other players.",
        'https://wiki.f-list.net/Guide:_Character_Profiles#General_Details'
      );
    }

    if (p.gender === null) {
      this.add(
        'GENDER',
        ProfileRecommendationLevel.CRITICAL,
        'Enter gender',
        "Specifying your character's gender will help matching you with other players",
        'https://wiki.f-list.net/Guide:_Character_Profiles#General_Details'
      );
    }
  }

  protected checkSpeciesPreferences(): void {
    const p = this.profile;
    const c = this.profile.character;

    if (p.furryPreference === null) {
      return;
    }

    if (p.furryPreference === FurryPreference.FurriesOnly) {
      if (Matcher.getKinkPreference(c, Kink.Humans)! > 0) {
        this.add(
          'KINK_MISMATCH_FURRIES_ONLY_HUMAN',
          ProfileRecommendationLevel.NOTE,
          'Inconsistent kink',
          'Your "furries-only" profile has a positive "humans" kink. If you are open to playing with humans, consider updating your preference from "furries only" to "furs and humans".'
        );
      }
    }

    if (p.furryPreference === FurryPreference.HumansOnly) {
      if (
        Matcher.getKinkPreference(c, Kink.AnimalsFerals)! >= 0 ||
        Matcher.getKinkPreference(c, Kink.Zoophilia)! >= 0
      ) {
        // do nothing
      } else {
        const likedAnthros = this.getLikedAnimals();

        _.each(likedAnthros, species => {
          this.add(
            'KINK_MISMATCH_HUMANS_ONLY_ANTHRO',
            ProfileRecommendationLevel.NOTE,
            'Inconsistent kink',
            `Your "humans-only" profile has a positive "furry" kink (${Matcher.getSpeciesName(species)}). If you are open to playing with anthros, consider updating your preference from "humans only" to "furs and humans"`
          );
        });
      }
    }

    if (p.furryPreference !== FurryPreference.HumansOnly) {
      const likedAnthros = this.getLikedAnimals();

      if (
        likedAnthros &&
        !_.difference(likedAnthros, [
          Kink.AnthroCharacters,
          Kink.Mammals,
          Kink.Humans
        ] as any as Species[])
      ) {
        this.add(
          'KINK_NO_SPECIES',
          ProfileRecommendationLevel.NOTE,
          'Add preferred species',
          'Specifying which anthro species you like (e.g. "equines", or "canines") in your kinks can improve your matches.'
        );
      }
    }
  }

  protected getLikedAnimals(): Species[] {
    const c = this.profile.character;

    return _.filter(
      mammalSpecies,
      species => Matcher.getKinkPreference(c, species)! > 0
    );
  }
}
