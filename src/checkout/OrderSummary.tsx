"use client"
/**
 * OrderSummary
 * Minimal read‑only summary: adds product lines + naive subtotal.
 * Non‑production simplifications: price strings parsed client‑side,
 * shipping always "Free", subtotal == estimated total.
 */
import React from 'react'

export interface ProductSummaryItem {
    id: number | string
    name: string
    href?: string
    price: string // formatted (e.g. "$99.95") – kept simple for demo
    color?: string
    size?: string
}

interface OrderSummaryProps {
    products: ProductSummaryItem[]
}

export const OrderSummary: React.FC<OrderSummaryProps> = ({ products }) => {
    // Parse each price string (e.g. "$99.95") into a number (demo only)
    const subtotal = products.reduce((acc, p) => {
        const numeric = parseFloat(p.price.replace(/[^0-9.]/g, ''))
        return acc + (isNaN(numeric) ? 0 : numeric)
    }, 0)
    const formattedSubtotal = `$${subtotal.toFixed(2)}`
    // Estimated total = subtotal in this simplified example.
    const estimatedTotal = formattedSubtotal

    return (
        <section
            aria-labelledby="summary-heading"
            className="bg-blue-950 pt-6 pb-12 text-blue-300 md:px-10 lg:col-start-2 lg:row-start-1 lg:mx-auto lg:w-full lg:max-w-lg lg:bg-transparent lg:px-0 lg:pt-0 lg:pb-24"
        >
            <div className="mx-auto max-w-2xl px-4 lg:max-w-none lg:px-0">
                <h2 id="summary-heading" className="sr-only">
                    Order summary
                </h2>

                <dl>
                    <dt className="text-sm font-medium">Amount due</dt>
                    <dd className="mt-1 text-3xl font-bold tracking-tight text-white">{formattedSubtotal}</dd>
                </dl>

                <ul role="list" className="divide-y divide-white/10 text-sm font-medium">
                    {products.map((product) => (
                        <li key={product.id} className="flex items-start space-x-4 py-6">
                            <div className="flex-auto space-y-1">
                                <h3 className="text-white">{product.name}</h3>
                                {product.color && <p>{product.color}</p>}
                                {product.size && <p>{product.size}</p>}
                            </div>
                            <p className="flex-none text-base font-medium text-white">{product.price}</p>
                        </li>
                    ))}
                </ul>

                <dl className="space-y-6 border-t border-white/10 pt-6 text-sm font-medium">
                    <div className="flex items-center justify-between">
                        <dt>Subtotal</dt>
                        <dd>{formattedSubtotal}</dd>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/10 pt-6 text-white">
                        <dt className="text-base">
                            Estimated total <span className="text-xs">(inc VAT)</span>
                        </dt>
                        <dd className="text-base">{estimatedTotal}</dd>
                    </div>
                </dl>
            </div>
        </section>
    )
}

export default OrderSummary
