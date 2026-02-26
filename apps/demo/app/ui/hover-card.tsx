import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { PortalHost } from '@tallyui/primitives';
import {
  HoverCard, HoverCardTrigger, HoverCardContent,
  Button, Text, VStack, HStack, Avatar,
} from '@tallyui/components';

export default function HoverCardScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Hover Card' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">User Profile Card</Text>
          <Text className="text-sm text-muted-foreground">
            On web, hover over the link. On native, tap to toggle.
          </Text>
          <HoverCard>
            <HoverCardTrigger asChild>
              <Button variant="link"><Text>@johndoe</Text></Button>
            </HoverCardTrigger>
            <HoverCardContent>
              <VStack className="gap-3">
                <HStack className="items-center gap-3">
                  <Avatar alt="John Doe" fallback="JD" size="lg" />
                  <VStack className="gap-0.5">
                    <Text className="text-sm font-semibold">John Doe</Text>
                    <Text className="text-xs text-muted-foreground">@johndoe</Text>
                  </VStack>
                </HStack>
                <Text className="text-sm text-muted-foreground">
                  Software engineer working on design systems and component libraries.
                </Text>
                <Text className="text-xs text-muted-foreground">
                  Joined December 2021
                </Text>
              </VStack>
            </HoverCardContent>
          </HoverCard>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Project Card</Text>
          <HoverCard>
            <HoverCardTrigger asChild>
              <Button variant="link"><Text>TallyUI</Text></Button>
            </HoverCardTrigger>
            <HoverCardContent className="w-80">
              <VStack className="gap-2">
                <Text className="text-sm font-semibold">TallyUI Primitives</Text>
                <Text className="text-sm text-muted-foreground">
                  A headless, cross-platform component library for React Native and web.
                  Built with accessibility and composition in mind.
                </Text>
                <Text className="text-xs text-muted-foreground">
                  16 primitives and counting
                </Text>
              </VStack>
            </HoverCardContent>
          </HoverCard>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Link Preview</Text>
          <HoverCard>
            <HoverCardTrigger asChild>
              <Button variant="link"><Text>View documentation</Text></Button>
            </HoverCardTrigger>
            <HoverCardContent>
              <VStack className="gap-2">
                <Text className="text-sm font-semibold">Documentation</Text>
                <Text className="text-sm text-muted-foreground">
                  Browse the full component library documentation including
                  usage examples, props tables, and styling guides.
                </Text>
              </VStack>
            </HoverCardContent>
          </HoverCard>
        </VStack>
      </ScrollView>
      <PortalHost />
    </>
  );
}
