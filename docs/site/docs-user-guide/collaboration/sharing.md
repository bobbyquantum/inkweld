---
id: sharing
title: Sharing Projects
description: Invite collaborators and manage access to your writing projects.
sidebar_position: 3
---

# Sharing Projects

Project owners can invite other people to collaborate. Open **Project Settings** at the bottom of the project sidebar and choose the **Collaboration** section.

:::info
Sharing needs an **Inkweld Server** profile. With a Browser or Cloud Sync profile the Collaboration section only says that it requires a server connection.
:::

## Access Levels

| Role       | What they can do                                                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Owner**  | Everything. The only role that sees the **Collaboration**, **MCP** and **Danger Zone** sections: invite and remove people, change roles, rename or delete the project |
| **Admin**  | "Full access including settings": edits content and the project's templates, tags and other configuration, but does not manage collaborators or delete the project    |
| **Editor** | Create, edit and delete documents and worldbuilding entries ("Can view and edit content")                                                                             |
| **Viewer** | Browse and read all content, with no editing ("Can view project content")                                                                                             |

:::note[Who manages the collaborator list?]
In the app, only the project owner sees the Collaboration section, so inviting people, changing roles and removing people are owner tasks. (An Admin collaborator is trusted with the project's settings, not with who else has access.)
:::

## Inviting Collaborators

1. Open your project and go to **Project Settings → Collaboration**
2. Click **Invite Collaborator**
3. Enter their **Username** and choose a **Role** (Viewer, Editor or Admin); each choice shows a short description
4. Click **Send Invitation**

The invited person sees the invitation under **Pending Invitations** on their bookshelf, with **Accept** and **Decline** buttons. Once they accept, the project appears on their bookshelf with a group badge and they can work in it according to their role.

## Managing Collaborators

The Collaboration section lists everyone invited, with a count of those who have joined and a badge for invitations still **Pending**. Each row shows who they are, when they joined (or when and by whom they were invited), and lets you:

- **Change their role** using the dropdown on the row. The change takes effect straight away, even for people who have the project open.
- **Remove them** with the remove button (person icon) to revoke access immediately.

AI apps that someone has connected through OAuth/MCP appear separately under **Connected Apps**, with the person who authorised them and the role granted. Use **Manage in Settings** to review or revoke them under your Authorized Apps settings.

## Requirements

- Collaborators must have an account on the same Inkweld instance
- Their account must be active (approved, if user approval is enabled)
- You need to know their exact username

## Troubleshooting

**Can't find a user to invite?**  
Verify the exact username spelling. The user must already have an account on this instance.

**Collaborator can't access the project?**  
Check that their status badge reads **Joined** (not **Invited** or **Pending**) and their account is active. Try removing and re-inviting them.
