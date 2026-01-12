import { useRef, Suspense, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useGLTF, Environment, ContactShadows } from "@react-three/drei";
import * as THREE from "three";

interface ShoeProps {
    mousePosition: { x: number; y: number };
    deviceOrientation: { beta: number; gamma: number } | null;
}

function Shoe({ mousePosition, deviceOrientation }: ShoeProps) {
    const { scene } = useGLTF("/models/scene.gltf");
    const meshRef = useRef<THREE.Group>(null);
    const { viewport } = useThree();

    // Enable shadows on all meshes in the model
    useEffect(() => {
        scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
    }, [scene]);

    // Target rotation based on mouse position or device orientation (inverted for opposite direction)
    const targetRotation = useRef({ x: 0, y: -5 });

    useFrame(() => {
        if (meshRef.current) {
            // Use device orientation on mobile, mouse position on desktop
            if (deviceOrientation) {
                // Device orientation: beta = front-to-back tilt, gamma = left-to-right tilt
                // Normalize to -1 to 1 range (beta: -45 to 45 degrees, gamma: -45 to 45 degrees)
                const normalizedX = Math.max(-1, Math.min(1, deviceOrientation.gamma / 45));
                const normalizedY = Math.max(-1, Math.min(1, (deviceOrientation.beta - 45) / 45));
                
                targetRotation.current.x = -normalizedY * 0.15;
                targetRotation.current.y = -normalizedX * 0.5;
            } else {
                // Calculate target rotation (opposite to mouse movement)
                // Reduced x-rotation to prevent clipping through shadow
                targetRotation.current.x = -mousePosition.y * 0.15;
                targetRotation.current.y = -mousePosition.x * 0.5;
            }

            // Smooth interpolation
            meshRef.current.rotation.x = THREE.MathUtils.lerp(meshRef.current.rotation.x, targetRotation.current.x + 0.1, 0.05);
            meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, targetRotation.current.y - 1.0, 0.05);
        }
    });

    return (
        <group ref={meshRef} scale={viewport.width > 6 ? 10 : 7} position={[-0.3, -0.65, 0]} rotation={[0.15, -3, 0]}>
            <primitive object={scene} />
        </group>
    );
}

interface ShoeModelProps {
    mousePosition: { x: number; y: number };
}

export default function ShoeModel({ mousePosition }: ShoeModelProps) {
    const [deviceOrientation, setDeviceOrientation] = useState<{ beta: number; gamma: number } | null>(null);
    const [permissionGranted, setPermissionGranted] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const orientationHandlerRef = useRef<((event: DeviceOrientationEvent) => void) | null>(null);

    // Check if mobile on mount
    useEffect(() => {
        setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    }, []);

    // Set up orientation handler
    useEffect(() => {
        orientationHandlerRef.current = (event: DeviceOrientationEvent) => {
            if (event.beta !== null && event.gamma !== null) {
                setDeviceOrientation({
                    beta: event.beta,
                    gamma: event.gamma,
                });
            }
        };
    }, []);

    // Auto-enable motion on page load
    useEffect(() => {
        if (!isMobile) return;
        
        const enableMotion = async () => {
            // Check if permission API exists (iOS 13+)
            const requestPermission = (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
            
            if (requestPermission) {
                // iOS 13+ - request permission automatically
                try {
                    const permission = await requestPermission();
                    if (permission === 'granted') {
                        setPermissionGranted(true);
                        if (orientationHandlerRef.current) {
                            window.addEventListener('deviceorientation', orientationHandlerRef.current);
                        }
                    }
                } catch (error) {
                    console.log('Device orientation permission denied:', error);
                }
            } else {
                // Android or older iOS - just add listener directly
                setPermissionGranted(true);
                if (orientationHandlerRef.current) {
                    window.addEventListener('deviceorientation', orientationHandlerRef.current);
                }
            }
        };

        enableMotion();
        
        return () => {
            if (orientationHandlerRef.current) {
                window.removeEventListener('deviceorientation', orientationHandlerRef.current);
            }
        };
    }, [isMobile]);

    return (
        <div className="absolute inset-0 w-full h-full flex items-center justify-center">
            
            <Canvas shadows camera={{ position: [0, 0, 5], fov: 35 }} style={{ background: "transparent" }}>
                <ambientLight intensity={0.7} />
                {/* Main light from front-top to cast shadow behind */}
                <directionalLight
                    position={[0, 5, 10]}
                    intensity={1.5}
                    castShadow
                    shadow-mapSize={[2048, 2048]}
                    shadow-camera-far={50}
                    shadow-camera-left={-10}
                    shadow-camera-right={10}
                    shadow-camera-top={10}
                    shadow-camera-bottom={-10}
                />
                {/* Fill light from side */}
                <directionalLight position={[5, 3, 5]} intensity={0.6} />
                <directionalLight position={[-5, 3, 5]} intensity={0.4} />

                {/* Spotlight from front */}
                <spotLight position={[0, 5, 8]} intensity={0.8} angle={0.5} penumbra={1} castShadow />

                <Suspense fallback={null}>
                    <Shoe mousePosition={mousePosition} deviceOrientation={deviceOrientation} />
                    <ContactShadows position={[0, -0.9, 0]} opacity={0.4} scale={8} blur={2} far={2} color="#1b1717" />
                    <Environment preset="city" />
                </Suspense>
            </Canvas>
        </div>
    );
}

// Preload the model
useGLTF.preload("/models/scene.gltf");
