import { describe, expect, it } from 'vitest';
import { creatorBrief, creatorTopics } from './creatorTopics';
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

  it('returns nothing when the creator has not given the app anything to work with', () => {
    expect(creatorTopics({ user: user(), savedIdeas: [], videos: [] })).toEqual([]);
  });

  it('caps the list so the topic row stays compact', () => {
    const videos = Array.from({ length: 12 }, (_, i) => video(`Subject number ${i}`));
    expect(creatorTopics({ videos }).length).toBeLessThanOrEqual(6);
  });
});

describe('creatorBrief', () => {
  it('carries the niche and the subjects into generation', () => {
    expect(creatorBrief(['Editorial Systems', 'Notebook workflow'], user('Editorial Systems'))).toBe(
      'Creator niche: Editorial Systems\nSubjects this creator already makes: Editorial Systems, Notebook workflow'
    );
  });

  it('stays empty when there is nothing to say', () => {
    expect(creatorBrief([], user())).toBe('');
  });
});
