# Canvas GPT

A canvas-based chat application with branching conversations, built with React, TypeScript, and Tailwind CSS.

## Features

- Interactive canvas with draggable chat nodes
- Branching conversations from selected text
- Multiple AI model support (Claude, GPT-4, etc.)
- Zoom and pan controls
- Real-time chat interface
- Visual connection lines between nodes

## Getting Started

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:5173`

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Technologies Used

- React 18
- TypeScript
- Vite
- Tailwind CSS
- Lucide React (icons)
- ESLint

## Project Structure

```
src/
├── App.tsx          # Main application component
├── main.tsx         # Application entry point
└── index.css        # Global styles with Tailwind
```


## Supabase Setup

1. Create a Supabase project and copy the project URL and anon key.
2. Add a `.env.local` file (or use your preferred env management) in the project root with:

```bash
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

3. In Supabase SQL editor, create the table that stores each user's canvas state and enable row level security:

```sql
create table if not exists public.canvas_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  nodes jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.canvas_states
  add constraint canvas_states_user_unique unique (user_id);

alter table public.canvas_states enable row level security;

create policy "Individuals can manage their canvas"
  on public.canvas_states
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

4. Run the app with `npm run dev` – you will see an authentication screen. After signing in, your canvas is stored in Supabase and automatically synced.

> Tip: if you need to reset your canvas for a user, delete the corresponding row from `public.canvas_states`.
