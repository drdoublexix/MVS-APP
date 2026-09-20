import { useRef } from "react";
import { Animated, PanResponder, StyleSheet, View } from "react-native";

type SwipeableMessageProps = {
  children: React.ReactNode;
  onReply: () => void;
  disabled?: boolean;
};

export default function SwipeableMessage({ children, onReply, disabled = false }: SwipeableMessageProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        !disabled && Math.abs(gestureState.dx) > 8 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy),
      onPanResponderMove: (_, gestureState) => {
        translateX.setValue(Math.max(0, Math.min(gestureState.dx, 72)));
      },
      onPanResponderRelease: (_, gestureState) => {
        const shouldReply = gestureState.dx >= 52 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
        if (shouldReply) onReply();
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
    })
  ).current;

  return (
    <View style={styles.wrapper}>
      <Animated.View style={[styles.replyIndicator, { opacity: translateX.interpolate({ inputRange: [0, 52], outputRange: [0, 1] }) }]}>
        <View style={styles.replyDot} />
      </Animated.View>
      <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: "relative" },
  replyIndicator: { position: "absolute", left: 8, top: "50%", width: 14, height: 14, marginTop: -7, borderRadius: 7, backgroundColor: "#10B981", alignItems: "center", justifyContent: "center" },
  replyDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#FFFFFF" },
});