/*
 * Copyright (C) 2017-2019 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { CallExpr, Expr, ExprScope, LiteralExpr, NumberLiteralExpr, Value } from "../Expr";
import { ExprEvaluatorContext, OperatorDescriptorMap } from "../ExprEvaluator";
import { createInterpolatedProperty, getPropertyValue } from "../InterpolatedProperty";
import { InterpolatedProperty, InterpolatedPropertyDefinition } from "../InterpolatedPropertyDefs";

/**
 * Evaluates the given piecewise function.
 */
function step(context: ExprEvaluatorContext, args: Expr[]) {
    if (args.length < 3 || args.length % 2) {
        throw new Error("not enough arguments");
    }

    const value = context.evaluate(args[0]) as number;

    if (value === null) {
        // returns the default value of step.
        return context.evaluate(args[1]);
    }

    if (typeof value !== "number") {
        throw new Error(`the input of a 'step' operator must have type 'number'`);
    }

    let first = 1;
    let last = args.length / 2 - 1;

    while (first < last) {
        // tslint:disable-next-line: no-bitwise
        const mid = (first + last) >>> 1;
        const stop = args[mid * 2];

        if (!(stop instanceof NumberLiteralExpr)) {
            throw new Error("expected a numeric literal");
        }

        if (value < stop.value) {
            last = mid - 1;
        } else if (value > stop.value) {
            first = mid + 1;
        } else {
            last = mid;
        }
    }

    const result = args[first * 2];

    if (!(result instanceof NumberLiteralExpr)) {
        throw new Error("expected a numeric literal");
    }

    const index = result.value <= value ? first : first - 1;

    return context.evaluate(args[index * 2 + 1]);
}

type InterpolateExpr = CallExpr & {
    _interpolatedProperty?: InterpolatedProperty;
    _isConstant?: boolean;
};

type StepExpr = CallExpr & {
    _isConstant?: boolean;
};

const operators = {
    ppi: {
        call: (context: ExprEvaluatorContext, call: CallExpr) => {
            const ppi = context.env.lookup("$ppi");
            if (typeof ppi === "number") {
                return ppi;
            }
            return 72;
        }
    },
    zoom: {
        call: (context: ExprEvaluatorContext, _: CallExpr): Value => {
            switch (context.scope) {
                case ExprScope.Condition:
                case ExprScope.Dynamic:
                    const zoom = context.env.lookup("$zoom")!;
                    if (zoom !== undefined) {
                        return zoom;
                    }
                    throw new Error("failed to get the zoom level.");

                default:
                    // direct usages of 'zoom' outside technique filter conditions
                    // and interpolations are not allowed.
                    throw new Error("invalid usage of the 'zoom' operator.");
            } // switch
        }
    },

    interpolate: {
        call: (context: ExprEvaluatorContext, call: InterpolateExpr): Value => {
            if (context.scope === ExprScope.Condition) {
                throw new Error("'interpolate' is not supported in conditions");
            }

            if (call._interpolatedProperty === undefined) {
                const interpolatorType = call.args[0];

                if (!(interpolatorType instanceof CallExpr)) {
                    throw new Error("expected an interpolation type");
                }

                let interpolation: InterpolatedPropertyDefinition<any>["interpolation"];
                let exponent: number | undefined;

                if (interpolatorType.op === "linear") {
                    interpolation = "Linear";
                } else if (interpolatorType.op === "discrete") {
                    interpolation = "Discrete";
                } else if (interpolatorType.op === "cubic") {
                    interpolation = "Cubic";
                } else if (interpolatorType.op === "exponential") {
                    interpolation = "Exponential";
                    const base = interpolatorType.children[0];
                    if (!(base instanceof NumberLiteralExpr)) {
                        throw new Error("expected the base of the exponential interpolation");
                    }
                    exponent = base.value;
                } else {
                    throw new Error("unrecognized interpolation type");
                }

                const input = call.args[1];

                if (!(input instanceof CallExpr)) {
                    throw new Error("expected the input of the interpolation");
                }

                if (input.op !== "zoom") {
                    throw new Error("only 'zoom' is supported");
                }

                if (call.args.length === 2 || call.args.length % 2) {
                    throw new Error("invalid number of samples");
                }

                const zoomLevels: number[] = [];
                const values: any[] = [];

                let isConstant = true;

                for (let i = 2; i < call.args.length; i += 2) {
                    const stop = call.args[i];
                    if (!(stop instanceof NumberLiteralExpr)) {
                        throw new Error("expected a numeric literal");
                    }

                    zoomLevels.push(stop.value);

                    const value = call.args[i + 1];

                    if (value instanceof LiteralExpr) {
                        values.push(value.value);
                    } else {
                        values.push(context.evaluate(call.args[i + 1]));
                        isConstant = false;
                    }
                }

                const interpolatedProperty = createInterpolatedProperty({
                    interpolation,
                    zoomLevels,
                    values,
                    exponent
                });

                if (interpolatedProperty === undefined) {
                    throw new Error("failed to create interpolator");
                }

                call._interpolatedProperty = interpolatedProperty;
                call._isConstant = isConstant;

                if (!call._isConstant) {
                    throw new Error(`not constant ${JSON.stringify(call)}`);
                }
            } else if (call._isConstant !== true) {
                // refresh the values

                const values: any[] = [];

                for (let i = 3; i < call.args.length; i += 2) {
                    const value = context.evaluate(call.args[i]);
                    values.push(value);
                }

                call._interpolatedProperty.values = values;
            }

            switch (context.scope) {
                case ExprScope.Value:
                    return call._isConstant === true
                        ? call
                        : new CallExpr(
                              call.op,
                              call.args.map(arg => context.partiallyEvaluate(arg))
                          );

                case ExprScope.Dynamic:
                    return getPropertyValue(call._interpolatedProperty, context.env);

                //case ExprScope.Condition:
                default:
                    throw new Error("'interpolate' is not supported in conditions");
            } // switch
        }
    },

    step: {
        call: (context: ExprEvaluatorContext, call: StepExpr): Value => {
            if (call.args[0] === undefined) {
                throw new Error("expected the input of the 'step' operator");
            }

            if (call._isConstant === undefined) {
                let isConstant = true;
                for (let i = 1; i < call.args.length; i += 2) {
                    const value = call.args[i];
                    if (!(value instanceof LiteralExpr)) {
                        isConstant = false;
                        break;
                    }
                }
                call._isConstant = isConstant;
            }

            switch (context.scope) {
                case ExprScope.Value:
                    return call._isConstant === true
                        ? call
                        : new CallExpr(
                              call.op,
                              call.args.map(arg => context.partiallyEvaluate(arg))
                          );
                default:
                    return step(context, call.args);
            } // switch
        }
    }
};

export const InterpolationOperators: OperatorDescriptorMap = operators;
export type InterpolationOperatorNames = keyof typeof operators;
