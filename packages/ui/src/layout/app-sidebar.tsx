"use client"

import * as React from "react"

import { NavCollaps } from "@workspace/ui/layout/nav-collaps"
import { NavMain } from "@workspace/ui/layout/nav-main"
import { TeamSwitcher } from "@workspace/ui/layout/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@workspace/ui/components/sidebar"
import {
  GalleryVerticalEndIcon,
  AudioLinesIcon,
  TerminalIcon,
  TerminalSquareIcon,
  BotIcon,
  BookOpenIcon,
  Settings2Icon,
  FrameIcon,
  PieChartIcon,
  MapIcon,
} from "lucide-react"
import { AppLogo } from "./app-logo"

// This is sample data.
const data = {
  teams: [
    {
      name: "Team Dokumen",
      logo: <GalleryVerticalEndIcon />,
      plan: "Admin",
    },
    {
      name: "Warehouse",
      logo: <AudioLinesIcon />,
      plan: "Admin",
    },
    {
      name: "Finance",
      logo: <TerminalIcon />,
      plan: "Admin",
    },
  ],
  collapsMenu: [
    {
      title: "Playground",
      href: "#",
      icon: <TerminalSquareIcon />,
      isActive: true,
      items: [
        {
          title: "History",
          href: "#",
        },
        {
          title: "Starred",
          href: "#",
        },
        {
          title: "Settings",
          href: "#",
        },
      ],
    },
    {
      title: "Models",
      href: "#",
      icon: <BotIcon />,
      items: [
        {
          title: "Genesis",
          href: "#",
        },
        {
          title: "Explorer",
          href: "#",
        },
        {
          title: "Quantum",
          href: "#",
        },
      ],
    },
    {
      title: "Documentation",
      href: "#",
      icon: <BookOpenIcon />,
      items: [
        {
          title: "Introduction",
          href: "#",
        },
        {
          title: "Get Started",
          href: "#",
        },
        {
          title: "Tutorials",
          href: "#",
        },
        {
          title: "Changelog",
          href: "#",
        },
      ],
    },
    {
      title: "Settings",
      href: "#",
      icon: <Settings2Icon />,
      items: [
        {
          title: "General",
          href: "#",
        },
        {
          title: "Team",
          href: "#",
        },
        {
          title: "Billing",
          href: "#",
        },
        {
          title: "Limits",
          href: "#",
        },
      ],
    },
  ],
  mainmenu: [
    {
      name: "Design Engineering",
      href: "#",
      icon: <FrameIcon />,
    },
    {
      name: "Sales & Marketing",
      href: "#",
      icon: <PieChartIcon />,
    },
    {
      name: "Travel",
      href: "#",
      icon: <MapIcon />,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={data.teams} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.mainmenu} />
        <NavCollaps items={data.collapsMenu} />
      </SidebarContent>
      <SidebarFooter>
        <AppLogo />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
