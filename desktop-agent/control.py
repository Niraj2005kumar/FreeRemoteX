import pyautogui


VALID_MOUSE_ACTIONS = {
    "move",
    "click",
    "double_click",
    "right_click",
    "mousedown",
    "mouseup",
    "scroll"
}


VALID_KEYBOARD_ACTIONS = {
    "keydown",
    "keyup",
    "press"
}


def execute_mouse_command(
    command: dict
):

    action = command.get(
        "action"
    )

    x = command.get(
        "x"
    )

    y = command.get(
        "y"
    )

    button = command.get(
        "button",
        "left"
    )

    if action not in VALID_MOUSE_ACTIONS:
        raise ValueError(
            "Invalid mouse action"
        )

    if action == "move":

        if x is None or y is None:
            raise ValueError(
                "x and y are required"
            )

        pyautogui.moveTo(
            float(x),
            float(y),
            duration=0
        )

    elif action == "click":

        pyautogui.click(
            x=float(x) if x is not None else None,
            y=float(y) if y is not None else None,
            button=button
        )

    elif action == "double_click":

        pyautogui.doubleClick(
            x=float(x) if x is not None else None,
            y=float(y) if y is not None else None,
            button=button
        )

    elif action == "right_click":

        pyautogui.rightClick(
            x=float(x) if x is not None else None,
            y=float(y) if y is not None else None
        )

    elif action == "mousedown":

        pyautogui.mouseDown(
            x=float(x) if x is not None else None,
            y=float(y) if y is not None else None,
            button=button
        )

    elif action == "mouseup":

        pyautogui.mouseUp(
            x=float(x) if x is not None else None,
            y=float(y) if y is not None else None,
            button=button
        )

    elif action == "scroll":

        amount = command.get(
            "amount",
            0
        )

        pyautogui.scroll(
            int(amount)
        )


def execute_keyboard_command(
    command: dict
):

    action = command.get(
        "action"
    )

    key = command.get(
        "key"
    )

    if action not in VALID_KEYBOARD_ACTIONS:
        raise ValueError(
            "Invalid keyboard action"
        )

    if not key:
        raise ValueError(
            "Keyboard key is required"
        )

    if action == "keydown":

        pyautogui.keyDown(
            key
        )

    elif action == "keyup":

        pyautogui.keyUp(
            key
        )

    elif action == "press":

        pyautogui.press(
            key
        )