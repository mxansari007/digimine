import { Card } from "@digimine/ui";

export default function ContactPage() {
    return (
        <div className="bg-gray-50 min-h-screen py-12">
            <div className="container-page max-w-4xl">
                <div className="text-center mb-12">
                    <h1 className="font-display text-4xl font-bold text-gray-900 mb-4">Contact Us</h1>
                    <p className="text-gray-600 text-lg">
                        Have questions? We&apos;d love to hear from you.
                    </p>
                </div>

                <div className="max-w-md mx-auto">
                    <Card padding="lg">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">Get in Touch</h2>
                        <div className="space-y-4 text-gray-600">
                            <div>
                                <p className="font-semibold text-gray-900">Email Us</p>
                                <a href="mailto:support@digimine.shop" className="text-primary-600 hover:underline">
                                    support@digimine.shop
                                </a>
                            </div>
                            <div>
                                <p className="font-semibold text-gray-900">Operating Hours</p>
                                <p>Monday to Friday: 9:00 AM - 6:00 PM IST</p>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
}
