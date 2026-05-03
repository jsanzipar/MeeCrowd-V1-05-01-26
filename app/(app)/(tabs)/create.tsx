// Tab placeholder for the "Create post" launcher in the bottom bar.
//
// The real create screen lives at /(app)/post/create — we never actually
// render this file because the tab's `tabBarButton` listener intercepts
// the press and pushes to that route instead. The Redirect below is a
// belt-and-suspenders fallback in case someone deep-links to /(tabs)/create.
import { Redirect } from 'expo-router';

export default function CreateTabRedirect() {
  return <Redirect href="/(app)/post/create" />;
}
