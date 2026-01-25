import {
    Body,
    Container,
    Head,
    Heading,
    Html,
    Preview,
    Section,
    Text,
    Tailwind,
} from "@react-email/components";
import * as React from "react";

interface OrderOtpEmailProps {
    otp: string;
    orderId: string;
}

export const OrderOtpEmail = ({
    otp = "123456",
    orderId = "ORDER-123",
}: OrderOtpEmailProps) => {
    return (
        <Html>
            <Head />
            <Preview>Your verification code for Order #{orderId}</Preview>
            <Tailwind>
                <Body className="bg-white my-auto mx-auto font-sans">
                    <Container className="border border-solid border-[#eaeaea] rounded my-[40px] mx-auto p-[20px] max-w-[465px]">
                        <Heading className="text-black text-[24px] font-normal text-center p-0 my-[30px] mx-0">
                            Verify Your Identity
                        </Heading>
                        <Text className="text-black text-[14px] leading-[24px]">
                            Hello,
                        </Text>
                        <Text className="text-black text-[14px] leading-[24px]">
                            Use the following One-Time Password (OTP) to access your order <strong>#{orderId}</strong>.
                        </Text>
                        <Section className="text-center mt-[32px] mb-[32px]">
                            <Text className="text-black text-[32px] font-bold tracking-[8px] my-0">
                                {otp}
                            </Text>
                        </Section>
                        <Text className="text-black text-[14px] leading-[24px]">
                            This code will expire in 10 minutes. If you didn't request this code, you can safely ignore this email.
                        </Text>
                    </Container>
                </Body>
            </Tailwind>
        </Html>
    );
};

export default OrderOtpEmail;
