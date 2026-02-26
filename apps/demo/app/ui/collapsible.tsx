import { useState } from 'react';
import { ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Card,
  CardContent,
  Text,
  VStack,
  Button,
} from '@tallyui/components';

export default function CollapsibleScreen() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Stack.Screen options={{ title: 'Collapsible' }} />
      <ScrollView className="flex-1 bg-background" contentContainerClassName="p-4 gap-6">
        <VStack className="gap-3">
          <Text className="text-lg font-bold">Uncontrolled</Text>
          <Text className="text-sm text-muted-foreground">
            Tap the trigger to expand or collapse the content.
          </Text>
          <Card>
            <CardContent className="pt-6">
              <Collapsible>
                <CollapsibleTrigger>
                  <Text className="font-medium">Show more details</Text>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <VStack className="mt-2 gap-2">
                    <Text>Here are the hidden details that were tucked away.</Text>
                    <Text>You can put any content in here.</Text>
                  </VStack>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Controlled</Text>
          <Text className="text-sm text-muted-foreground">
            State: {isOpen ? 'open' : 'closed'}
          </Text>
          <Card>
            <CardContent className="pt-6">
              <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <CollapsibleTrigger>
                  <Text className="font-medium">
                    {isOpen ? 'Hide' : 'Show'} additional info
                  </Text>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <VStack className="mt-2 gap-2">
                    <Text>
                      This collapsible is controlled by the parent component's state.
                    </Text>
                    <Text>
                      The trigger label updates to reflect the current open/closed status.
                    </Text>
                  </VStack>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Default Open</Text>
          <Card>
            <CardContent className="pt-6">
              <Collapsible defaultOpen>
                <CollapsibleTrigger>
                  <Text className="font-medium">Collapse this section</Text>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <VStack className="mt-2 gap-2">
                    <Text>This section starts expanded.</Text>
                    <Text>Tap the trigger above to collapse it.</Text>
                  </VStack>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">With Button Trigger</Text>
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="outline">
                <Text>Toggle Section</Text>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card className="mt-2">
                <CardContent className="pt-6">
                  <Text>
                    Using asChild, the trigger merges its behavior onto the Button component.
                  </Text>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Disabled</Text>
          <Card>
            <CardContent className="pt-6">
              <Collapsible disabled>
                <CollapsibleTrigger>
                  <Text className="text-muted-foreground">Cannot toggle (disabled)</Text>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Text>This content will never appear.</Text>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        </VStack>

        <VStack className="gap-3">
          <Text className="text-lg font-bold">Stacked Collapsibles</Text>
          <Text className="text-sm text-muted-foreground">
            Multiple independent collapsible sections. For linked sections, use Accordion instead.
          </Text>
          <Card>
            <CardContent className="pt-6">
              <VStack className="gap-4">
                <Collapsible>
                  <CollapsibleTrigger>
                    <Text className="font-medium">Shipping Info</Text>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <Text className="mt-2">Free shipping on orders over $50.</Text>
                  </CollapsibleContent>
                </Collapsible>
                <Collapsible>
                  <CollapsibleTrigger>
                    <Text className="font-medium">Return Policy</Text>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <Text className="mt-2">30-day returns, no questions asked.</Text>
                  </CollapsibleContent>
                </Collapsible>
                <Collapsible>
                  <CollapsibleTrigger>
                    <Text className="font-medium">Warranty</Text>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <Text className="mt-2">1-year manufacturer warranty included.</Text>
                  </CollapsibleContent>
                </Collapsible>
              </VStack>
            </CardContent>
          </Card>
        </VStack>
      </ScrollView>
    </>
  );
}
