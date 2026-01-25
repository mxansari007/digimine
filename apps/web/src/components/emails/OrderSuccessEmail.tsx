
import {
    Body,
    Container,
    Column,
    Head,
    Heading,
    Html,
    Img,
    Link,
    Preview,
    Row,
    Section,
    Text,
    Tailwind,
} from "@react-email/components";
import { formatCurrency } from "@digimine/utils";
import * as React from "react";

interface OrderSuccessEmailProps {
    orderId: string;
    customerName?: string;
    accessKey?: string;
    items: Array<{
        productName: string;
        price: number;
        quantity: number;
        productImage?: string | null;
        downloadUrl?: string;
    }>;
    total: number;
}

export const OrderSuccessEmail = ({
    orderId = "12345",
    accessKey,
    customerName = "Valued Customer",
    items = [],
    total = 0,
}: OrderSuccessEmailProps) => {
    const accessLink = `${process.env.NEXT_PUBLIC_APP_URL}/success?orderId=${orderId}${accessKey ? `&accessKey=${accessKey}` : ''}`;

    return (
        <Html>
            <Head />
            <Preview>Your DigiMine Order Receipt</Preview>
            <Tailwind>
                <Body className="bg-white my-auto mx-auto font-sans">
                    <Container className="border border-solid border-[#eaeaea] rounded my-[40px] mx-auto p-[20px] max-w-[465px]">
                        <Heading className="text-black text-[24px] font-normal text-center p-0 my-[30px] mx-0">
                            Thank you for your order!
                        </Heading>
                        <Text className="text-black text-[14px] leading-[24px]">
                            Hello {customerName},
                        </Text>
                        <Text className="text-black text-[14px] leading-[24px]">
                            We've received your order <strong>#{orderId}</strong>.
                        </Text>

                        {accessKey && (
                            <Section className="text-center mt-[32px] mb-[32px]">
                                <Link
                                    href={accessLink}
                                    className="bg-blue-600 text-white rounded px-[20px] py-[12px] no-underline font-bold text-[14px] block w-full"
                                >
                                    Access Your Order Dashboard
                                </Link>
                                <Text className="text-gray-500 text-[12px] mt-[10px] mx-0">
                                    <strong>Access Key:</strong> <span className="font-mono bg-gray-100 px-2 py-1 rounded">{accessKey}</span>
                                </Text>
                                <Text className="text-gray-500 text-[12px] mt-[5px] mx-0">
                                    Use this link or copy the key above to access your files in the future.
                                </Text>
                            </Section>
                        )}

                        <Text className="text-black text-[14px] leading-[24px]">
                            Below are the details of your purchase.
                        </Text>

                        <Section className="mt-[32px]">
                            {items.map((item, index) => (
                                <Row key={index} className="border-b border-solid border-[#eaeaea] pb-[16px] mb-[16px]">
                                    <Column>
                                        <Text className="text-black text-[14px] font-bold m-0">
                                            {item.productName}
                                        </Text>
                                        <Text className="text-gray-500 text-[12px] m-0">
                                            Qty: {item.quantity} | {formatCurrency(item.price * item.quantity)}
                                        </Text>
                                    </Column>
                                </Row>
                            ))}
                        </Section>

                        <Text className="text-black text-[14px] font-bold mt-[20px] text-right">
                            Total: {formatCurrency(total)}
                        </Text>

                        <Section className="mt-[32px] border-t border-solid border-[#eaeaea] pt-[20px]">
                            <Text className="text-[#666666] text-[12px] leading-[24px]">
                                If you have any questions, please reply to this email.
                            </Text>
                        </Section>
                    </Container>
                </Body>
            </Tailwind>
        </Html>
    );
};

export default OrderSuccessEmail;
