# KontentOS - AI Video Content & Publishing Suite

KontentOS is an end-to-end content creation, transcription, caption generation, script writing, and monetization engine powered by Google Gemini and Supabase.

---

## 🚀 Deployment Guide (Vercel)

Before deploying to Vercel, complete the following prerequisites:

1. **Supabase Storage Bucket**:
   - Create a bucket named `videos` in your Supabase dashboard under **Storage**.
   - Set the bucket configuration to **Public Read** and **Authenticated Write**.

2. **Database Schema**:
   - Run the contents of `supabase-schema.sql` in the **Supabase SQL Editor** to create all tables (`users`, `videos`, `subtitles`, `publishing_history`), indexes, and storage RLS policies.

3. **Vercel Environment Variables**:
   Configure the following variables in your Vercel Project Settings (**Settings -> Environment Variables**):

   | Environment Variable | Description |
   | :--- | :--- |
   | `GEMINI_API_KEY` | Your Google Gemini API Key |
   | `SUPABASE_URL` | Your Supabase project URL (`https://your-project.supabase.co`) |
   | `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase Service Role Key |
   | `NODE_ENV` | `production` |

---

## 🛠️ Local Development

```bash
# Install dependencies
npm install

# Start local dev server
npm run dev
```
