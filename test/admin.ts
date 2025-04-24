import { expect } from 'chai';
import sinon from 'sinon';
import Admin from '../model/admin';
import Supabase from '../model/supabase';
import DataImporter from '../model/data/importer';
import { AdminPhase, CollectionMeta } from '../model/data/types';
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../database.types';

describe('Admin', () => {
  let admin: Admin;
  let supabase: Supabase;
  let dataImporter: DataImporter;
  let getLaunchpadByIdStub: sinon.SinonStub;
  let getLaunchpadPhaseInfoStub: sinon.SinonStub;
  let updateLaunchpadPhasesStub: sinon.SinonStub;
  let updateLaunchpadByIdStub: sinon.SinonStub;
  let getMarketplaceStub: sinon.SinonStub;

  beforeEach(() => {
    supabase = new Supabase({ supabase: {} as SupabaseClient<Database>, platformFeeAddress: '2MxUuoWH8uv3ta6ic2eETpaGmpwS3DsXErx' });
    dataImporter = new DataImporter({ supabase });
    admin = new Admin({ supabase, dataImporter });

    getLaunchpadByIdStub = sinon.stub(supabase, 'getLaunchpadById');
    getLaunchpadPhaseInfoStub = sinon.stub(supabase, 'getLaunchpadPhaseInfo');
    updateLaunchpadPhasesStub = sinon.stub(supabase, 'updateLaunchpadPhases');
    updateLaunchpadByIdStub = sinon.stub(supabase, 'updateLaunchpadById');
    getMarketplaceStub = sinon.stub(supabase, 'getMarketplace');
  });

  afterEach(() => {
    sinon.restore();
  });

  describe('#getLaunchpadInfo()', () => {
    const mockLaunchpadId = 1;
    const mockLaunchpadData = {
      id: mockLaunchpadId,
      slug: 'test-collection',
      marketplace_id: 'some-marketplace-id',
      meta_data: {
        name: 'Test Collection',
        description: 'A test collection'
      }
    };
    const mockPhaseData = [
      {
        id: 1,
        name: "Early bird",
        price: 1500,
        status: "active",
        end_date: 1729621810,
        is_public: false,
        start_date: 1729621800,
        launchpad_id: 1,
        phase_number: 1,
        total_inscriptions: 10,
        remaining_inscriptions: 10
      },
      {
        id: 2,
        name: "Moon chand Era",
        price: 2500,
        status: "active",
        end_date: 1730593665,
        is_public: false,
        start_date: 1730507265,
        launchpad_id: 1,
        phase_number: 2,
        total_inscriptions: 10,
        remaining_inscriptions: 10
      }
    ];

    it('should return launchpad info with phases when both exist', async () => {
      getLaunchpadByIdStub.resolves({ data: mockLaunchpadData, error: null });
      getMarketplaceStub.resolves({
        id: 'some-marketplace-id',
        name: 'Some Marketplace',
        api_key: 'some-api-key'
      });
      getLaunchpadPhaseInfoStub.resolves({ data: mockPhaseData, error: null });

      const result = await admin.getLaunchpadInfo(mockLaunchpadId);

      expect(result).to.deep.equal({
        ...mockLaunchpadData,
        phases: mockPhaseData,
        marketplace: {
          id:'some-marketplace-id',
          name: 'Some Marketplace',
          api_key:'some-api-key'
        }
      });
      expect(getLaunchpadByIdStub.calledOnceWith(mockLaunchpadId)).to.be.true;
      expect(getMarketplaceStub.calledOnceWith({id: 'some-marketplace-id'})).to.be.true;
      expect(getLaunchpadPhaseInfoStub.calledOnceWith({ 'launchpad_id': mockLaunchpadId })).to.be.true;
    });

    it('should return error when launchpad is not found', async () => {
      getLaunchpadByIdStub.resolves({ data: null, error: new Error('Not found') });

      const result = await admin.getLaunchpadInfo(mockLaunchpadId);

      expect(result).to.deep.equal({ error: 'launchpad not found' });
      expect(getLaunchpadPhaseInfoStub.called).to.be.false;
    });

    it('should return error when phase info is not found', async () => {
      getLaunchpadByIdStub.resolves({ data: mockLaunchpadData, error: null });
      getLaunchpadPhaseInfoStub.resolves({ data: null, error: new Error('Phases not found') });

      const result = await admin.getLaunchpadInfo(mockLaunchpadId);

      expect(result).to.deep.equal({ error: 'launchpad phase not found' });
    });
  });

  describe('#updateLaunchpadInfo()', () => {
    const mockLaunchpadId = 1;
    const mockSlug = 'updated-collection';
    const mockMeta: CollectionMeta = {
      name: 'Updated Collection',
      slug: 'updated-collection',
      description: 'An updated test collection'
    };

    const mockPhases: AdminPhase[] = [
      {
        isPublic: 0,
        startDate: 1737854105,
        id: 1,
        endDate: 1737940505,
        name: 'Updated Phase 1',
        allowList: [
          {
            address: 'some-address-1',
            allocation: 5
          },
          {
            address: 'some-address-2',
            allocation: 5
          },
        ]
      },
      {
        isPublic: 1,
        startDate: 1737940505,
        id: 2,
        endDate: null,
        name: 'Updated Phase 2',
      }
    ];

    it('should successfully update launchpad info and phases', async () => {
      getLaunchpadByIdStub.resolves({ data: { id: mockLaunchpadId }, error: null });
      updateLaunchpadPhasesStub.resolves({ error: null });
      updateLaunchpadByIdStub.resolves({ data: { id: mockLaunchpadId, slug: mockSlug }, error: null });

      const result = await admin.updateLaunchpadInfo(mockLaunchpadId, mockSlug, mockMeta, mockPhases);

      expect(result).to.deep.equal({
        data: { id: mockLaunchpadId, slug: mockSlug },
        error: null
      });
      expect(updateLaunchpadPhasesStub.calledOnceWith(mockPhases)).to.be.true;
      expect(updateLaunchpadByIdStub.calledOnceWith(mockLaunchpadId, {
        slug: mockSlug,
        meta_data: mockMeta
      })).to.be.true;
    });

    it('should return error when launchpad is not found', async () => {
      getLaunchpadByIdStub.resolves({ data: null, error: new Error('Not found') });

      const result = await admin.updateLaunchpadInfo(mockLaunchpadId, mockSlug, mockMeta, mockPhases);

      expect(result).to.deep.equal({ error: 'launchpad not found' });
      expect(updateLaunchpadPhasesStub.called).to.be.false;
      expect(updateLaunchpadByIdStub.called).to.be.false;
    });

    it('should return error when phases update fails', async () => {
      getLaunchpadByIdStub.resolves({ data: { id: mockLaunchpadId }, error: null });
      updateLaunchpadPhasesStub.resolves({ error: new Error('Phase update failed') });

      const result = await admin.updateLaunchpadInfo(mockLaunchpadId, mockSlug, mockMeta, mockPhases);

      expect(result).to.deep.equal({ error: 'Launchpad phases are not updated' });
      expect(updateLaunchpadByIdStub.called).to.be.false;
    });
  });
});