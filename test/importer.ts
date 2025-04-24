import { assert, expect } from 'chai';
import sinon from 'sinon';
import DataImporter from '../model/data/importer';
import Supabase from '../model/supabase';
import { Database } from '../database.types';
import { SupabaseClient } from '@supabase/supabase-js';
import { toSupabaseResponse } from './helpers';

describe('DataImporter', () => {
    let importer: DataImporter;
    let supabase: Supabase;

    beforeEach(() => {
        supabase = new Supabase({ supabase:{} as SupabaseClient<Database>, platformFeeAddress: '2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx' });
        importer = new DataImporter({ supabase });
    });

    describe('#onboardCollection()', () => {
        const request = {
            "meta": {
                "description": "Satoshi has come home to Bitcoin! The Ordinals collection by OG NFT project Satoshibles are a limited edition collection of 100 ordinals, featuring all new traits from the original artist Ayyoub Bouzerda. This collection is a tribute to Satoshi and the enduring legacy of Bitcoin. Don't miss your chance to own a piece of history!",
                "discord_link": "https://discord.com/invite/7Wm9Jg8MkW",
                "icon": "https://turbo.ordinalswallet.com/inscription/preview/3542f12dbe5fe3bd7fd622d1bb54994432e9a9184d24ff62ceb83234383b558ei0",
                "inscription_icon": "3542f12dbe5fe3bd7fd622d1bb54994432e9a9184d24ff62ceb83234383b558ei0",
                "name": "Satoshibles: The Ordinals",
                "slug": "satoshibles-the-ordinals",
                "twitter_link": "https://twitter.com/satoshibles",
                "website_link": "https://satoshibles.com"
            },
            "data": [
                {
                    "id": "8e7ba76e0c06ff5f43f50371bce849ae4e88dd36e1c0629e1a6f4383d1b0e679i0",
                    "meta": {
                        "attributes": [
                            {
                                "trait_type": "background",
                                "value": "orange"
                            },
                            {
                                "trait_type": "skin",
                                "value": "standard"
                            },
                            {
                                "trait_type": "eyes",
                                "value": "standard"
                            },
                            {
                                "trait_type": "eye-accessory",
                                "value": "blues"
                            },
                            {
                                "trait_type": "facial-hair",
                                "value": "standard"
                            },
                            {
                                "trait_type": "body",
                                "value": "tshirt-black"
                            },
                            {
                                "trait_type": "ear-accessory",
                                "value": "standard"
                            },
                            {
                                "trait_type": "head",
                                "value": "hair-black"
                            },
                            {
                                "trait_type": "mouth",
                                "value": "toothpick"
                            }
                        ],
                        "name": "Satoshibles: The Ordinals #1"
                    }
                },
                {
                    "id": "4b0cd3e3110a2e65fbe9c4b173f642a173ac5abe80a958f8034a9a1e1e099237i0",
                    "meta": {
                        "attributes": [
                            {
                                "trait_type": "background",
                                "value": "yellow"
                            },
                            {
                                "trait_type": "skin",
                                "value": "standard"
                            },
                            {
                                "trait_type": "eyes",
                                "value": "standard"
                            },
                            {
                                "trait_type": "eye-accessory",
                                "value": "retro"
                            },
                            {
                                "trait_type": "facial-hair",
                                "value": "standard"
                            },
                            {
                                "trait_type": "body",
                                "value": "stormzy"
                            },
                            {
                                "trait_type": "ear-accessory",
                                "value": "standard"
                            },
                            {
                                "trait_type": "head",
                                "value": "bald"
                            },
                            {
                                "trait_type": "mouth",
                                "value": "standard"
                            }
                        ],
                        "name": "Satoshibles: The Ordinals #2"
                    }
                }
            ]
        };

        it('should onboard a collection', async () => {
            const mockCollection = {
                data: [],
                error: null
            };

            const categories = [
                { "id": 1, "name": "background" },
                { "id": 2, "name": "skin" },
                { "id": 3, "name": "eyes" },
                { "id": 4, "name": "eye-accessory" },
                { "id": 5, "name": "facial-hair" },
                { "id": 6, "name": "body" },
                { "id": 7, "name": "ear-accessory" },
                { "id": 8, "name": "head" },
                { "id": 9, "name": "mouth" }
              ];

            sinon.stub(supabase, 'getCollection').resolves(toSupabaseResponse(mockCollection, null));
            sinon.stub(supabase, 'getInscriptionsWithoutCollection').resolves({ data: [], error: null, count: 0, status: 200, statusText: 'OK' });
            const insertCollectionStub = sinon.stub(supabase, 'insertCollection').resolves(toSupabaseResponse({ id: 1 }, null));
            const upsertInscriptionStub = sinon.stub(supabase, 'upsertInscription').resolves(toSupabaseResponse([{ id: 1, inscription_id: '8e7ba76e0c06ff5f43f50371bce849ae4e88dd36e1c0629e1a6f4383d1b0e679i0' }, { id: 2, inscription_id: '4b0cd3e3110a2e65fbe9c4b173f642a173ac5abe80a958f8034a9a1e1e099237i0' }], null));
            const getExistingAttributesStub = sinon.stub(supabase, 'getExistingAttributeCategories').resolves(toSupabaseResponse([], null));
            const insertCategoriesStub = sinon.stub(supabase, 'insertCategories').resolves(toSupabaseResponse([], null));
            const getCategoriesForCollectionStub = sinon.stub(supabase, 'getCategoriesForCollection').resolves(toSupabaseResponse(categories, null));
            const upsetAttributesStub = sinon.stub(supabase, 'upsetAttributes').resolves(toSupabaseResponse([], null));
            sinon.stub(supabase, 'getInscription').resolves(toSupabaseResponse([], null));

            const result = await importer.onboardCollection(request.meta, request.data);
            
            const wantAttributes = [
                {
                  inscription_id: 1,
                  category_id: 1,
                  value: "orange",
                  value_type: "string",
                },
                {
                  inscription_id: 1,
                  category_id: 2,
                  value: "standard",
                  value_type: "string",
                },
                {
                  inscription_id: 1,
                  category_id: 3,
                  value: "standard",
                  value_type: "string",
                },
                {
                  inscription_id: 1,
                  category_id: 4,
                  value: "blues",
                  value_type: "string",
                },
                {
                  inscription_id: 1,
                  category_id: 5,
                  value: "standard",
                  value_type: "string",
                },
                {
                  inscription_id: 1,
                  category_id: 6,
                  value: "tshirt-black",
                  value_type: "string",
                },
                {
                  inscription_id: 1,
                  category_id: 7,
                  value: "standard",
                  value_type: "string",
                },
                {
                  inscription_id: 1,
                  category_id: 8,
                  value: "hair-black",
                  value_type: "string",
                },
                {
                  inscription_id: 1,
                  category_id: 9,
                  value: "toothpick",
                  value_type: "string",
                },
                {
                  inscription_id: 2,
                  category_id: 1,
                  value: "yellow",
                  value_type: "string",
                },
                {
                  inscription_id: 2,
                  category_id: 2,
                  value: "standard",
                  value_type: "string",
                },
                {
                  inscription_id: 2,
                  category_id: 3,
                  value: "standard",
                  value_type: "string",
                },
                {
                  inscription_id: 2,
                  category_id: 4,
                  value: "retro",
                  value_type: "string",
                },
                {
                  inscription_id: 2,
                  category_id: 5,
                  value: "standard",
                  value_type: "string",
                },
                {
                  inscription_id: 2,
                  category_id: 6,
                  value: "stormzy",
                  value_type: "string",
                },
                {
                  inscription_id: 2,
                  category_id: 7,
                  value: "standard",
                  value_type: "string",
                },
                {
                  inscription_id: 2,
                  category_id: 8,
                  value: "bald",
                  value_type: "string",
                },
                {
                  inscription_id: 2,
                  category_id: 9,
                  value: "standard",
                  value_type: "string",
                },
            ];


            const wantNewCategories = [
                {
                  collection_id: 1,
                  name: "background",
                },
                {
                  collection_id: 1,
                  name: "skin",
                },
                {
                  collection_id: 1,
                  name: "eyes",
                },
                {
                  collection_id: 1,
                  name: "eye-accessory",
                },
                {
                  collection_id: 1,
                  name: "facial-hair",
                },
                {
                  collection_id: 1,
                  name: "body",
                },
                {
                  collection_id: 1,
                  name: "ear-accessory",
                },
                {
                  collection_id: 1,
                  name: "head",
                },
                {
                  collection_id: 1,
                  name: "mouth",
                },
              ];

            const wantCollectionData = {
                description: "Satoshi has come home to Bitcoin! The Ordinals collection by OG NFT project Satoshibles are a limited edition collection of 100 ordinals, featuring all new traits from the original artist Ayyoub Bouzerda. This collection is a tribute to Satoshi and the enduring legacy of Bitcoin. Don't miss your chance to own a piece of history!",
                discord_link: "https://discord.com/invite/7Wm9Jg8MkW",
                icon: "https://turbo.ordinalswallet.com/inscription/preview/3542f12dbe5fe3bd7fd622d1bb54994432e9a9184d24ff62ceb83234383b558ei0",
                inscription_icon: 1,
                name: "Satoshibles: The Ordinals",
                slug: "satoshibles-the-ordinals",
                twitter_link: "https://twitter.com/satoshibles",
                website_link: "https://satoshibles.com",
                is_under_review: true,
                is_tradable: true,
            };

            const wantInscriptions = [
                {
                  inscription_id: "8e7ba76e0c06ff5f43f50371bce849ae4e88dd36e1c0629e1a6f4383d1b0e679i0",
                  collection_id: 1,
                  name: "Satoshibles: The Ordinals #1",
                },
                {
                  inscription_id: "4b0cd3e3110a2e65fbe9c4b173f642a173ac5abe80a958f8034a9a1e1e099237i0",
                  collection_id: 1,
                  name: "Satoshibles: The Ordinals #2",
                },
              ];

            expect(result).to.deep.equal({ success: true, id: 1, error: null });
            const actualInsertCollectionCall = insertCollectionStub.getCall(0).args[0];
            expect(actualInsertCollectionCall).to.deep.equal(wantCollectionData);
            expect(upsetAttributesStub.getCall(0).args[0]).to.deep.equal(wantAttributes);
            expect(insertCategoriesStub.getCall(0).args[0]).to.deep.equal(wantNewCategories);
            expect(upsertInscriptionStub.getCall(0).args[0]).to.deep.equal([{ inscription_id: '3542f12dbe5fe3bd7fd622d1bb54994432e9a9184d24ff62ceb83234383b558ei0' }]);
            expect(upsertInscriptionStub.getCall(1).args[0]).to.deep.equal(wantInscriptions);
        });
    });
});