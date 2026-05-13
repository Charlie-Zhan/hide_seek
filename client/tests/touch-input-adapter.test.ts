import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { InputController } from '../assets/scripts/input/InputController';
import {
  TouchInputAdapter,
  calculateLandscapeSafeInsets,
  createLandscapeControlLayout
} from '../assets/scripts/input/TouchInputAdapter';

describe('TouchInputAdapter Phase 05 touch controls', () => {
  it('maps landscape safe area into separated left joystick and right action zones', () => {
    const insets = calculateLandscapeSafeInsets(844, 390, {
      left: 44,
      top: 0,
      right: 844,
      bottom: 369
    });

    assert.deepEqual(insets, { left: 44, right: 0, top: 0, bottom: 21 });

    const layout = createLandscapeControlLayout({
      screenWidth: 844,
      screenHeight: 390,
      safeArea: {
        left: 44,
        top: 0,
        right: 844,
        bottom: 369
      },
      joystickRadius: 64,
      actionButtonRadius: 52,
      edgePadding: 24,
      bottomPadding: 22,
      touchPadding: 18
    });

    assert.equal(layout.joystick.centerX, 132);
    assert.equal(layout.actionButton.centerX, 768);
    assert.equal(layout.joystick.centerY, 283);
    assert.equal(layout.actionButton.centerY, 283);
    assert.ok(layout.joystick.centerX < layout.screenWidth / 2);
    assert.ok(layout.actionButton.centerX > layout.screenWidth / 2);
  });

  it('keeps left-hand movement active when the right action touch starts', () => {
    const input = new InputController();
    const layout = createLandscapeControlLayout({
      screenWidth: 800,
      screenHeight: 450,
      joystickRadius: 60,
      actionButtonRadius: 54
    });
    const adapter = new TouchInputAdapter({ layout, sink: input, joystickDeadZone: 0 });

    adapter.handleTouchStarts([
      {
        id: 1,
        x: layout.joystick.centerX + layout.joystick.radius,
        y: layout.joystick.centerY
      },
      {
        id: 2,
        x: layout.actionButton.centerX,
        y: layout.actionButton.centerY
      }
    ]);

    assert.deepEqual(input.getMove(), { x: 1, y: 0 });
    assert.equal(input.hasActionQueued(), true);
    assert.equal(input.consumeAction(), true);

    adapter.handleTouchMove({
      id: 2,
      x: layout.joystick.centerX,
      y: layout.joystick.centerY - layout.joystick.radius
    });

    assert.deepEqual(input.getMove(), { x: 1, y: 0 });

    adapter.handleTouchEnd(2);
    assert.deepEqual(input.getMove(), { x: 1, y: 0 });

    adapter.handleTouchMove({
      id: 1,
      x: layout.joystick.centerX,
      y: layout.joystick.centerY - layout.joystick.radius
    });

    assert.deepEqual(input.getMove(), { x: 0, y: 1 });
  });

  it('does not let secondary touches steal the joystick owner', () => {
    const input = new InputController();
    const layout = createLandscapeControlLayout({
      screenWidth: 800,
      screenHeight: 450,
      joystickRadius: 60,
      actionButtonRadius: 54
    });
    const adapter = new TouchInputAdapter({ layout, sink: input, joystickDeadZone: 0 });

    adapter.handleTouchStart({
      id: 'left-primary',
      x: layout.joystick.centerX + layout.joystick.radius,
      y: layout.joystick.centerY
    });
    adapter.handleTouchStart({
      id: 'left-secondary',
      x: layout.joystick.centerX - layout.joystick.radius,
      y: layout.joystick.centerY
    });

    assert.deepEqual(input.getMove(), { x: 1, y: 0 });

    adapter.handleTouchMove({
      id: 'left-secondary',
      x: layout.joystick.centerX,
      y: layout.joystick.centerY - layout.joystick.radius
    });
    assert.deepEqual(input.getMove(), { x: 1, y: 0 });

    adapter.handleTouchEnd('left-secondary');
    assert.deepEqual(input.getMove(), { x: 1, y: 0 });

    adapter.handleTouchEnd('left-primary');
    assert.deepEqual(input.getMove(), { x: 0, y: 0 });
  });

  it('normalizes joystick movement and applies dead zone without using platform APIs', () => {
    const input = new InputController();
    const layout = createLandscapeControlLayout({
      screenWidth: 800,
      screenHeight: 450,
      joystickRadius: 50
    });
    const adapter = new TouchInputAdapter({ layout, sink: input, joystickDeadZone: 0.2 });

    adapter.handleTouchStart({
      id: 1,
      x: layout.joystick.centerX + 5,
      y: layout.joystick.centerY
    });
    assert.deepEqual(input.getMove(), { x: 0, y: 0 });

    adapter.handleTouchMove({
      id: 1,
      x: layout.joystick.centerX + 100,
      y: layout.joystick.centerY - 100
    });

    const move = input.getMove();
    assert.ok(move.x > 0.7 && move.x < 0.71);
    assert.ok(move.y > 0.7 && move.y < 0.71);
  });
});
