import { describe, expect, it } from 'vitest';
import { cleanCreatorSubject, creatorBrief, creatorTopics } from './creatorTopics';
import type { Idea } from '@/data/mock';
import type { User, Video } from './types';

const user = (niche?: string): User =>
  ({
    id: 'u1',
    email: 'creator@example.com',
    full_name: 'Creator',
    niche,
    created_at: '2026-01-01T00:00:00.000Z',
  }) as User;

const idea = (title: string, focus = 'Operator Playbook'): Idea =>
  ({ id: title, title, blueprint: { focus } }) as unknown as Idea;

const video = (title: string): Video =>
  ({ id: title, title, user_id: 'u1', file_url: '', status: 'ready' }) as Video;

describe('creatorTopics', () => {
  it('puts the creator niche first, then subjects from their own archive', () => {
    expect(
      creatorTopics({
        user: user('Editorial Systems'),
        savedIdeas: [idea('How to run a weekly review')],
        videos: [video('The notebook workflow')],
      })
    ).toEqual(['Editorial Systems', 'run a weekly review', 'Operator Playbook', 'notebook workflow']);
  });

  it('de-duplicates case-insensitively and ignores raw filenames', () => {
    expect(
      creatorTopics({
        user: user('Minimalist Systems'),
        savedIdeas: [idea('minimalist systems', '')],
        videos: [video('IMG_2049.mp4'), video('Minimalist Systems')],
      })
    ).toEqual(['Minimalist Systems']);
  });

  it('uses a clip description when its filename is not a real subject', () => {
    const clip = { ...video('IMG_2049.mp4'), description: 'Morning studio walkthrough' } as Video;
    expect(creatorTopics({ videos: [clip] })).toEqual(['Morning studio walkthrough']);
  });

  it('rejects numeric camera filenames instead of showing them as topics', () => {
    expect(creatorTopics({ videos: [video('81496-576306063 (1)')] })).toEqual([]);
  });

  it('keeps a renamed clip with words in it', () => {
    expect(creatorTopics({ videos: [video('Studio tour take 3')] })).toEqual(['Studio tour take']);
  });

  it('returns nothing when the creator has not given the app anything to work with', () => {
    expect(creatorTopics({ user: user(), savedIdeas: [], videos: [] })).toEqual([]);
  });

  it('caps the list so the topic row stays compact', () => {
    const videos = Array.from({ length: 12 }, (_, i) => video(`Subject number ${i}`));
    expect(creatorTopics({ videos }).length).toBeLessThanOrEqual(6);
  });
});

describe('cleanCreatorSubject', () => {
  it('reduces a camera filename to no subject at all', () => {
    expect(cleanCreatorSubject('81496-576306063 (1)')).toBe('');
    expect(cleanCreatorSubject('IMG_2049.mp4')).toBe('');
  });

  it('keeps a renamed clip intact', () => {
    expect(cleanCreatorSubject('Studio tour take 3')).toBe('Studio tour take');
  });
});

describe('creatorBrief', () => {
  it('carries the niche and the subjects into generation', () => {
    expect(creatorBrief(['Editorial Systems', 'Notebook workflow'], user('Editorial Systems'))).toBe(
      'Creator niche: Editorial Systems\n' +
        'Subjects this creator already makes: Editorial Systems, Notebook workflow\n' +
        'Keep every idea tied to those subjects and to making content; do not drift into generic industry trends.'
    );
  });

  it('stays empty when there is nothing to say', () => {
    expect(creatorBrief([], user())).toBe('');
  });
});
